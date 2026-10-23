import { verify as verifyTotp } from "otplib";
import { randomBytes } from "node:crypto";

import { redis } from "../../../lib/redis.js";
import { hashValue } from "../auth.utils.js";

import { prisma } from "../../../lib/prisma.js";
import { decrypt } from "../../../utils/encryption.js";
import { checkRateLimit } from "../../../utils/rateLimiter.js";
import { AppError } from "../../../errors/AppError.js";
import { ERROR_CODES } from "../../../errors/errorCodes.js";

// Import these from the files where your existing helpers are defined.

import { AuditLogService } from "../../audit/auditLog.service.js";
import { AUDIT_EVENTS } from "../../audit/auditLog.types.js";
import { createAuthenticationSessionTx } from "../session.service.js";
import { generateAccessToken } from "../token.service.js";


const MFA_CHALLENGE_TTL_SECONDS = 5 * 60;

const MFA_VERIFY_LIMIT = 5;
const MFA_VERIFY_WINDOW_SECONDS = 5 * 60;

const MFA_IP_VERIFY_LIMIT = 20;
const MFA_IP_VERIFY_WINDOW_SECONDS = 15 * 60;


interface CreateMfaChallengeInput {
  userId: string;
  userAgent?: string;
  ipAddress?: string;
}

interface VerifyMfaChallengeInput {
  challengeToken: string;
  method: "TOTP" | "RECOVERY_CODE";
  code: string;
  ipAddress?: string;
  userAgent?: string;
}


export const createMfaLoginChallenge = async (
  input: CreateMfaChallengeInput,
) => {
  const challengeToken = randomBytes(32).toString("base64url");

  const challengeKey =
    `auth:mfa:challenge:${hashValue(challengeToken)}`;

  const challengeData = {
    userId: input.userId,
    userAgent: input.userAgent ?? null,
    ipAddress: input.ipAddress ?? null,
  };

  await redis.set(
    challengeKey,
    JSON.stringify(challengeData),
    "EX",
    MFA_CHALLENGE_TTL_SECONDS,
    "NX",
  );

  return {
    challengeToken,
    expiresIn: MFA_CHALLENGE_TTL_SECONDS,
  };
};

export const verifyMfaChallenge = async (
  input: VerifyMfaChallengeInput,
) => {
  const {
    challengeToken,
    method,
    code,
    ipAddress,
    userAgent,
  } = input;

  const challengeHash = hashValue(challengeToken);
  const challengeKey = `auth:mfa:challenge:${challengeHash}`;

  // Limit attempts against a particular challenge.
  const limit = await checkRateLimit(
    `auth:rate-limit:mfa:challenge:${challengeHash}`,
    MFA_VERIFY_LIMIT,
    MFA_VERIFY_WINDOW_SECONDS,
  );

  if (!limit.allowed) {
    throw new AppError(
      ERROR_CODES.RATE_LIMITED,
      "Too many MFA verification attempts. Please try again later.",
      429,
    );
  }

  if (ipAddress) {
    const ipLimit = await checkRateLimit(
      `auth:rate-limit:mfa:verify:ip:${hashValue(ipAddress)}`,
      MFA_IP_VERIFY_LIMIT,
      MFA_IP_VERIFY_WINDOW_SECONDS,
    );

    if (!ipLimit.allowed) {
      throw new AppError(
        ERROR_CODES.RATE_LIMITED,
        "Too many MFA verification attempts. Please try again later.",
        429,
      );
    }
  }

  // Read without consuming it, so invalid codes can be retried.
  const challengeJson = await redis.get(challengeKey);

  if (!challengeJson) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "MFA challenge is invalid or expired",
      400,
    );
  }

  const challenge = JSON.parse(
    challengeJson,
  );

  let recoveryCodeHash: string | undefined;

  if (method === "TOTP") {
    const mfaMethod = await prisma.mfaMethod.findFirst({
      where: {
        userId: challenge.userId,
        type: "TOTP",
        enabledAt: { not: null },
      },
    });

    if (!mfaMethod?.secretEncrypted) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "TOTP MFA is unavailable",
        400,
      );
    }

    const secret = decrypt(mfaMethod.secretEncrypted);

    const result = await verifyTotp({
      secret,
      token: code,
    });

    if (!result.valid) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Invalid authentication code",
        400,
      );
    }
  } else {
    const normalizedCode = code.trim().toUpperCase();
    recoveryCodeHash = hashValue(normalizedCode);

    // Check before consuming the challenge so a mistyped code
    // does not immediately invalidate the login attempt.
    const recoveryCode = await prisma.recoveryCode.findFirst({
      where: {
        userId: challenge.userId,
        codeHash: recoveryCodeHash,
        usedAt: null,
      },
      select: { id: true },
    });

    if (!recoveryCode) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Recovery code is invalid or has already been used",
        400,
      );
    }
  }

  // Atomically consume the challenge. Only one request can win.
  const consumedChallenge = await redis.getdel(challengeKey);

  if (!consumedChallenge) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "MFA challenge is invalid, expired, or already used",
      400,
    );
  }

  let sessionData: {
    sessionId: string;
    refreshToken: string;
  };

  if (method === "RECOVERY_CODE" && recoveryCodeHash) {
    // Consume the recovery code and create the session in one
    // database transaction.
    sessionData = await prisma.$transaction(async (tx) => {
      const consumedCode = await tx.recoveryCode.updateMany({
        where: {
          userId: challenge.userId,
          codeHash: recoveryCodeHash,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      });

      if (consumedCode.count !== 1) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          "Recovery code is invalid or has already been used",
          400,
        );
      }

      return createAuthenticationSessionTx(tx, {
        userId: challenge.userId,
        userAgent: challenge.userAgent ?? userAgent,
        ipAddress: challenge.ipAddress ?? ipAddress,
      });
    });
  }else {
    sessionData = await prisma.$transaction(async (tx) => {
      return createAuthenticationSessionTx(tx, {
        userId: challenge.userId,
        userAgent: challenge.userAgent ?? userAgent,
        ipAddress: challenge.ipAddress ?? ipAddress,
      });
    });
  }

  const accessToken = await generateAccessToken(
    challenge.userId,
    sessionData.sessionId,
  );

  await AuditLogService.log({
    userId: challenge.userId,
    event: AUDIT_EVENTS.LOGIN_SUCCESS,
    ipAddress: challenge.ipAddress ?? ipAddress,
    userAgent: challenge.userAgent ?? userAgent,
    metadata: {
      method: "password+mfa",
      mfaMethod: method,
    },
  });

  return {
    authentication: {
      sessionId: sessionData.sessionId,
      accessToken,
      refreshToken: sessionData.refreshToken,
    },
  };
};
