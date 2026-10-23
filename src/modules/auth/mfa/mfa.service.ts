import {
  generateSecret,
  generateURI,
  verify,
} from "otplib";

import { prisma } from "../../../lib/prisma.js";
import { encrypt } from "../../../utils/encryption.js";
import { AppError } from "../../../errors/AppError.js";
import { ERROR_CODES } from "../../../errors/errorCodes.js";
import { decrypt } from "../../../utils/encryption.js";
import { AuditLogService } from "../../audit/auditLog.service.js";
import { AUDIT_EVENTS } from "../../audit/auditLog.types.js";
import { generateRecoveryCodes } from "../../../utils/recoveryCodes.js";
import { hashValue } from "../auth.utils.js";
import argon2 from "argon2";
import { checkRateLimit } from "../../../utils/rateLimiter.js";


const setupTotp = async (
  userId: string,
) => {
  const existingMethod =
    await prisma.mfaMethod.findFirst({
      where: {
        userId,
        type: "TOTP",
      },
    });

  if (existingMethod?.enabledAt) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "TOTP MFA is already enabled",
      400,
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      emailAddresses: {
        where: {
          isPrimary: true,
        },
        select: {
          email: true,
        },
        take: 1,
      },
    },
  });

  if (!user) {
    throw new AppError(
      ERROR_CODES.USER_NOT_FOUND,
      "User not found",
      404,
    );
  }

  const email =
    user.emailAddresses[0]?.email;

  if (!email) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      "Primary email address not found",
      404,
    );
  }

  const secret = generateSecret();

  const secretEncrypted = encrypt(secret);

  const otpauthUrl = generateURI({
    issuer: "Advanced Auth Platform",
    label: email,
    secret,
  });

  const mfaMethod =
    existingMethod
      ? await prisma.mfaMethod.update({
          where: {
            id: existingMethod.id,
          },
          data: {
            secretEncrypted,
            enabledAt: null,
          },
        })
      : await prisma.mfaMethod.create({
          data: {
            userId,
            type: "TOTP",
            secretEncrypted,
          },
        });

  return {
    mfaMethodId: mfaMethod.id,
    secret,
    otpauthUrl,
  };
};

const verifyTotp = async (userId: string, code: string) => {
  const mfaMethod = await prisma.mfaMethod.findFirst({
    where: {
      userId,
      type: "TOTP",
    },
  });

  if (!mfaMethod || !mfaMethod.secretEncrypted) {
    throw new AppError(
      ERROR_CODES.NOT_FOUND,
      "TOTP setup not found. Please set up MFA first.",
      404,
    );
  }

  if (mfaMethod.enabledAt) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "TOTP MFA is already enabled",
      400,
    );
  }

  const secret = decrypt(mfaMethod.secretEncrypted);

  const verification = await verify({
    secret,
    token: code,
  });

  if (!verification.valid) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "Invalid or expired authentication code",
      400,
    );
  }

  // Generate plaintext codes only after successful TOTP verification.
  const recoveryCodes = generateRecoveryCodes();

  // Persist only SHA-256 hashes, never plaintext recovery codes.
  const recoveryCodeRecords = recoveryCodes.map((recoveryCode) => ({
    userId,
    codeHash: hashValue(recoveryCode),
  }));

  const enabledAt = new Date();

  await prisma.$transaction(async (tx) => {
    // Only one concurrent verification request can enable this pending method.
    const result = await tx.mfaMethod.updateMany({
      where: {
        id: mfaMethod.id,
        userId,
        type: "TOTP",
        enabledAt: null,
      },
      data: {
        enabledAt,
      },
    });

    if (result.count !== 1) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "TOTP setup has already been completed. Please start again if needed.",
        400,
      );
    }

    // Remove old recovery codes so re-enrollment cannot leave stale codes active.
    await tx.recoveryCode.deleteMany({
      where: { userId },
    });

    await tx.recoveryCode.createMany({
      data: recoveryCodeRecords,
    });
  });

  // Audit metadata must never contain the secret, TOTP, or recovery codes.
  await AuditLogService.log({
    userId,
    event: AUDIT_EVENTS.MFA_ENABLED,
    metadata: {
      method: "TOTP",
      recoveryCodesGenerated: recoveryCodes.length,
    },
  });

  return {
    message: "TOTP MFA enabled successfully",
    enabledAt,
    recoveryCodes,
  };
};

const verifyRecoveryCode = async (
  userId: string,
  recoveryCode: string,
) => {
  // Normalize the code because generated codes are uppercase.
  const normalizedCode = recoveryCode.trim().toUpperCase();
  const codeHash = hashValue(normalizedCode);

  await prisma.$transaction(async (tx) => {
    // Recovery codes are valid only while TOTP MFA is enabled.
    const enabledTotp = await tx.mfaMethod.findFirst({
      where: {
        userId,
        type: "TOTP",
        enabledAt: { not: null },
      },
      select: { id: true },
    });

    if (!enabledTotp) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Recovery code is invalid or unavailable",
        400,
      );
    }

    // Atomic consumption prevents concurrent reuse.
    const result = await tx.recoveryCode.updateMany({
      where: {
        userId,
        codeHash,
        usedAt: null,
      },
      data: {
        usedAt: new Date(),
      },
    });

    if (result.count !== 1) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Recovery code is invalid or has already been used",
        400,
      );
    }
  });

  return {
    message: "Recovery code verified successfully",
  };
};


const disableMfa = async (
  userId: string,
  input: {
    password: string;
    method: "TOTP" | "RECOVERY_CODE";
    code: string;
  },
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
  },
) => {
  // 1. Limit repeated MFA-disable attempts for this user.
  const rateLimit = await checkRateLimit(
    `auth:rate-limit:mfa:disable:user:${userId}`,
    5,
    15 * 60,
  );

  if (!rateLimit.allowed) {
    throw new AppError(
      ERROR_CODES.RATE_LIMITED,
      "Too many MFA disable attempts. Please try again later.",
      429,
    );
  }

  // 2. Verify the current password.
  const passwordCredential =
    await prisma.passwordCredential.findUnique({
      where: { userId },
      select: { passwordHash: true },
    });

  if (
    !passwordCredential ||
    !(await argon2.verify(
      passwordCredential.passwordHash,
      input.password,
    ))
  ) {
    throw new AppError(
      ERROR_CODES.INVALID_CREDENTIALS,
      "Invalid password",
      401,
    );
  }

  // 3. Find the enabled TOTP method.
  const mfaMethod = await prisma.mfaMethod.findFirst({
    where: {
      userId,
      type: "TOTP",
      enabledAt: { not: null },
    },
  });

  if (!mfaMethod || !mfaMethod.secretEncrypted) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "MFA is not enabled for this account",
      400,
    );
  }

  let recoveryCodeHash: string | undefined;

  // 4. Verify the requested second factor.
  if (input.method === "TOTP") {
    const secret = decrypt(mfaMethod.secretEncrypted);

    const result = await verify({
      secret,
      token: input.code,
    });

    if (!result.valid) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Invalid or expired authentication code",
        400,
      );
    }
  } else {
    recoveryCodeHash = hashValue(
      input.code.trim().toUpperCase(),
    );

    // Check that the recovery code exists before starting
    // the transaction. It is consumed atomically inside it.
    const recoveryCode = await prisma.recoveryCode.findFirst({
      where: {
        userId,
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

  // 5. Disable MFA and invalidate recovery codes atomically.
  await prisma.$transaction(async (tx) => {
    if (input.method === "RECOVERY_CODE" && recoveryCodeHash) {
      const consumedCode = await tx.recoveryCode.updateMany({
        where: {
          userId,
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
    }

    // Conditional update prevents two concurrent requests
    // from both successfully disabling the same MFA method.
    const disabledMethod = await tx.mfaMethod.updateMany({
      where: {
        id: mfaMethod.id,
        userId,
        type: "TOTP",
        enabledAt: { not: null },
      },
      data: {
        enabledAt: null,
        secretEncrypted: null,
      },
    });

    if (disabledMethod.count !== 1) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "MFA is already disabled or has changed. Please try again.",
        400,
      );
    }

    // All recovery codes are now invalid.
    await tx.recoveryCode.deleteMany({
      where: { userId },
    });
  });

  // 6. Record the security event without sensitive values.
  await AuditLogService.log({
    userId,
    event: AUDIT_EVENTS.MFA_DISABLED,
    ipAddress: metadata?.ipAddress,
    userAgent: metadata?.userAgent,
    metadata: {
      method: input.method,
    },
  });

  return {
    message: "MFA disabled successfully",
  };
};


const regenerateRecoveryCodes = async (
  userId: string,
  input: {
    password: string;
    code: string;
  },
  metadata?: {
    ipAddress?: string;
    userAgent?: string;
  },
) => {
  // 1. Rate-limit regeneration attempts.
  const rateLimit = await checkRateLimit(
    `auth:rate-limit:mfa:recovery:regenerate:${userId}`,
    5,
    15 * 60,
  );

  if (!rateLimit.allowed) {
    throw new AppError(
      ERROR_CODES.RATE_LIMITED,
      "Too many recovery-code regeneration attempts. Please try again later.",
      429,
    );
  }

  // 2. Verify the user's current password.
  const passwordCredential =
    await prisma.passwordCredential.findUnique({
      where: { userId },
      select: { passwordHash: true },
    });

  if (
    !passwordCredential ||
    !(await argon2.verify(
      passwordCredential.passwordHash,
      input.password,
    ))
  ) {
    throw new AppError(
      ERROR_CODES.INVALID_CREDENTIALS,
      "Invalid password",
      401,
    );
  }

  // 3. Find an enabled TOTP method.
  const mfaMethod = await prisma.mfaMethod.findFirst({
    where: {
      userId,
      type: "TOTP",
      enabledAt: { not: null },
    },
  });

  if (!mfaMethod?.secretEncrypted) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "TOTP MFA must be enabled to regenerate recovery codes",
      400,
    );
  }

  // 4. Verify the current authenticator code.
  const secret = decrypt(mfaMethod.secretEncrypted);

  const verification = await verify({
    secret,
    token: input.code,
  });

  if (!verification.valid) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      "Invalid or expired authentication code",
      400,
    );
  }

  // 5. Generate a completely new set.
  const recoveryCodes = generateRecoveryCodes();

  const recoveryCodeRecords = recoveryCodes.map(
    (recoveryCode) => ({
      userId,
      codeHash: hashValue(recoveryCode),
    }),
  );

  // 6. Replace the existing set atomically.
  await prisma.$transaction(async (tx) => {
    // Delete all previous codes, including already-used codes.
    await tx.recoveryCode.deleteMany({
      where: { userId },
    });

    await tx.recoveryCode.createMany({
      data: recoveryCodeRecords,
    });
  });

  // 7. Audit without logging plaintext codes or secrets.
  await AuditLogService.log({
    userId,
    event: AUDIT_EVENTS.MFA_RECOVERY_CODES_REGENERATED,
    ipAddress: metadata?.ipAddress,
    userAgent: metadata?.userAgent,
    metadata: {
      method: "TOTP",
      recoveryCodesGenerated: recoveryCodes.length,
    },
  });

  // Plaintext codes are returned only in this response.
  return {
    message: "Recovery codes regenerated successfully",
    recoveryCodes,
  };
};




export const MfaService = {
  setupTotp,
  verifyTotp,
  verifyRecoveryCode,
  disableMfa,
  regenerateRecoveryCodes,
};


