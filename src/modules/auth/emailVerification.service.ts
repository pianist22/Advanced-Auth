import { AppError } from "../../errors/AppError.js";
import { ERROR_CODES } from "../../errors/errorCodes.js";
import { prisma } from "../../lib/prisma.js";
import { redis } from "../../lib/redis.js";
import {
  generateSecureToken,
  hashToken,
} from "../../utils/crypto.js";
import { checkRateLimit } from "../../utils/rateLimiter.js";
import { hashValue } from "./auth.utils.js";
import { createAuthenticationSessionTx } from "./session.service.js";
import { generateAccessToken } from "./token.service.js";
import { enqueueVerificationEmail } from "../notifications/email/email.service.js";

const EMAIL_VERIFICATION_TTL_SECONDS = 15 * 60;

const getVerificationKey = (
  tokenHash: string,
): string => {
  return `auth:email-verification:${tokenHash}`;
};

export const createEmailVerificationToken = async (
  userId: string,
): Promise<string> => {
  const token = generateSecureToken(32);
  const tokenHash = hashToken(token);

  const key = getVerificationKey(tokenHash);

  await redis.set(
    key,
    userId,
    "EX",
    EMAIL_VERIFICATION_TTL_SECONDS,
  );

  return token;
};

export const consumeEmailVerificationToken = async (
  token: string,
): Promise<string | null> => {
  const tokenHash = hashToken(token);
  const key = getVerificationKey(tokenHash);

  return redis.getdel(key);
};

export const verifyEmail = async (
  token: string,
  userAgent?: string,
  ipAddress?: string,
) => {
  const userId =
    await consumeEmailVerificationToken(token);

  if (!userId) {
    throw new AppError(
      ERROR_CODES.INVALID_VERIFICATION_TOKEN,
      "Invalid or expired email verification token",
      400,
    );
  }

  const result = await prisma.$transaction(
    async (tx) => {
      const emailAddress =
        await tx.emailAddress.findFirst({
          where: {
            userId,
            isPrimary: true,
          },
        });

      if (!emailAddress) {
        throw new AppError(
          ERROR_CODES.USER_NOT_FOUND,
          "User email address not found",
          404,
        );
      }

      if (emailAddress.verifiedAt) {
        return {
          alreadyVerified: true as const,
          userId,
          email: emailAddress.email,
          authentication: null,
        };
      }

      const verifiedEmail =
        await tx.emailAddress.update({
          where: {
            id: emailAddress.id,
          },
          data: {
            verifiedAt: new Date(),
          },
        });

      const authentication =
        await createAuthenticationSessionTx(
          tx,
          {
            userId,
            userAgent,
            ipAddress,
          },
        );

      return {
        alreadyVerified: false as const,
        userId,
        email: verifiedEmail.email,
        authentication,
      };
    },
  );

  if (result.alreadyVerified) {
    return result;
  }

  const accessToken = await generateAccessToken(
    result.userId,
    result.authentication.sessionId,
  );

  return {
    user: {
      id: result.userId,
      email: result.email,
      emailVerified: true,
    },
    authentication: {
      sessionId: result.authentication.sessionId,
      accessToken,
      refreshToken: result.authentication.refreshToken,
    },
  };
};

export const resendEmailVerification = async (
  email: string,
): Promise<void> => {
  const normalizedEmail = email.trim().toLowerCase();

    const emailHash = hashValue(normalizedEmail);

    const rateLimit = await checkRateLimit(
      `auth:rate-limit:email-verification-resend:${emailHash}`,
      1,  // Maximum one request
      60, // Per 60-second window
    );

    if (!rateLimit.allowed) {
      throw new AppError(
        ERROR_CODES.RATE_LIMITED,
        "Please wait before requesting another verification email",
        429,
      );
    }

  const emailAddress =
    await prisma.emailAddress.findUnique({
      where: {
        email: normalizedEmail,
      },
      include: {
        user: true,
      },
    });

  if (!emailAddress) {
    return;
  }

  if (emailAddress.verifiedAt) {
    return;
  }

  const verificationToken =
    await createEmailVerificationToken(
      emailAddress.userId,
    );

  // Development only.
  // if (env.NODE_ENV === "development") {
  //   logger.debug(
  //     {
  //       userId: emailAddress.userId,
  //       verificationToken,
  //     },
  //     "Email verification token generated",
  //   );

  //   // Do NOT log the raw token.
  // }

  // Later:
  // await notificationService.sendVerificationEmail(...)
    await enqueueVerificationEmail(
      emailAddress.email,
      verificationToken,
    );
};

export const isEmailVerificationTokenValid = async (
  token: string,
): Promise<boolean> => {
  const tokenHash = hashToken(token);
  const key = getVerificationKey(tokenHash);

  return (await redis.exists(key)) === 1;
};

export const EmailVerificationService = {
  verifyEmail,
  createEmailVerificationToken,
  consumeEmailVerificationToken,
  resendEmailVerification,
};