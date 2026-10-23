import argon2 from "argon2";
import { Prisma } from "@prisma/client";

import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import { ERROR_CODES } from "../../errors/errorCodes.js";
import type { LoginInput, SignupInput } from "./auth.types.js";
import { createEmailVerificationToken } from "./emailVerification.service.js";
import { env } from "../../config/env.js";
import { createAuthenticationSession } from "./session.service.js";
import { LoginSecurityService } from "./loginSecurity.service.js";
import { AuditLogService } from "../audit/auditLog.service.js";
import { AUDIT_EVENTS } from "../audit/auditLog.types.js";
import { createMfaLoginChallenge } from "./mfa/mfaChallenge.service.js";
import { enqueueVerificationEmail } from "../notifications/email/email.service.js";

export const signup = async (data: SignupInput) => {
  const normalizedEmail = data.email.trim().toLowerCase();

  const existingEmail = await prisma.emailAddress.findUnique({
    where: {
      email: normalizedEmail,
    },
  });

  if (existingEmail) {
    throw new AppError(
      ERROR_CODES.EMAIL_ALREADY_EXISTS,
      "Email already exists",
      409,
    );
  }

  const passwordHash = await argon2.hash(data.password, {
    type: argon2.argon2id,
  });

  try {
    const user = await prisma.$transaction(async (tx) => {
      return tx.user.create({
        data: {
          emailAddresses: {
            create: {
              email: normalizedEmail,
              isPrimary: true,
            },
          },

          passwordCredential: {
            create: {
              passwordHash,
            },
          },
        },

        include: {
          emailAddresses: {
            where: {
              isPrimary: true,
            },
            select: {
              email: true,
              verifiedAt: true,
            },
          },
        },
      });
    });

    const verificationToken =
      await createEmailVerificationToken(user.id);

    // Queue the verification email after the database transaction succeeds.
    await enqueueVerificationEmail(
      normalizedEmail,
      verificationToken,
    );

    return {
      message: "User created successfully",
      user: {
        id: user.id,
        email: user.emailAddresses[0]?.email,
        emailVerified: false,
        status: user.status,
        createdAt: user.createdAt,
      },

      verification: {
        required: true,
      },
    };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new AppError(
        ERROR_CODES.EMAIL_ALREADY_EXISTS,
        "Email already exists",
        409,
      );
    }

    throw error;
  }
};

export const login = async (
  data: LoginInput,
  userAgent?: string,
  ipAddress?: string,
) => {
  const normalizedEmail =
    data.email.trim().toLowerCase();

    // Security Checks

    // 1. Check IP Rate Limit
    if (ipAddress) {
      await LoginSecurityService.checkLoginIpRateLimit(
        ipAddress,
        userAgent,
      );
    }   
    
    // Check Email Protection
    await LoginSecurityService.checkLoginEmailRateLimit(
    normalizedEmail,
    userAgent,
    ipAddress,
    );

  const isBlocked =
    await LoginSecurityService.isLoginTemporarilyBlocked(
      normalizedEmail,
      ipAddress,
      userAgent,
    );

  if (isBlocked) {
    throw new AppError(
      ERROR_CODES.RATE_LIMITED,
      "Too many login attempts. Please try again later.",
      429,
    );
  }

  const emailAddress =
    await prisma.emailAddress.findUnique({
      where: {
        email: normalizedEmail,
      },
    });

  if (!emailAddress) {
    await AuditLogService.log({
      event: AUDIT_EVENTS.LOGIN_FAILED,
      ipAddress,
      userAgent,
      metadata: {
        method: "password",
        reason: "invalid_credentials",
      },
    });
    throw new AppError(
      ERROR_CODES.INVALID_CREDENTIALS,
      "Invalid email or password",
      401,
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      id: emailAddress.userId,
    },
  });

  if (!user) {
    throw new AppError(
      ERROR_CODES.INVALID_CREDENTIALS,
      "Invalid email or password",
      401,
    );
  }

  if (user.status !== "ACTIVE") {
    throw new AppError(
      ERROR_CODES.FORBIDDEN,
      "Account is not active",
      403,
    );
  }

  if (!emailAddress.verifiedAt) {
    throw new AppError(
      ERROR_CODES.EMAIL_NOT_VERIFIED,
      "Please verify your email before logging in",
      403,
    );
  }

  const passwordCredential =
    await prisma.passwordCredential.findUnique({
      where: {
        userId: user.id,
      },
    });

  if (!passwordCredential) {
    throw new AppError(
      ERROR_CODES.INVALID_CREDENTIALS,
      "Invalid email or password",
      401,
    );
  }
  const isPasswordValid =
    await argon2.verify(
      passwordCredential.passwordHash,
      data.password,
    );

  if (!isPasswordValid) {
    const shouldBlock =
      await LoginSecurityService.recordFailedLogin(
        normalizedEmail,
      );

    if (shouldBlock) {
      await LoginSecurityService.blockLoginTemporarily(
        normalizedEmail,
      );
    }

    await AuditLogService.log({
      userId: user.id,
      event: AUDIT_EVENTS.LOGIN_FAILED,
      ipAddress,
      userAgent,
      metadata: {
        method: "password",
        reason: "invalid_credentials",
      },
    });

    throw new AppError(
      ERROR_CODES.INVALID_CREDENTIALS,
      "Invalid email or password",
      401,
    );
  }

  await LoginSecurityService.clearLoginFailures(
    normalizedEmail,
  );

  // Check whether the user has enabled TOTP MFA.
  const enabledTotp = await prisma.mfaMethod.findFirst({
    where: {
      userId: user.id,
      type: "TOTP",
      enabledAt: {
        not: null,
      },
    },
    select: {
      id: true,
    },
  });

  // Password is valid, but MFA must be completed first.
  if (enabledTotp) {
    const challenge = await createMfaLoginChallenge({
      userId: user.id,
      userAgent,
      ipAddress,
    });

    return {
      mfaRequired: true,
      challengeToken: challenge.challengeToken,
      expiresIn: challenge.expiresIn,
      methods: ["TOTP", "RECOVERY_CODE"],
    };
  }

  const authentication =
    await createAuthenticationSession({
      userId: user.id,
      userAgent,
      ipAddress,
    });

    await AuditLogService.log({
      userId: user.id,
      event: AUDIT_EVENTS.LOGIN_SUCCESS,
      ipAddress,
      userAgent,
      metadata: {
        method: "password",
      },
    });

  return {
    user: {
      id: user.id,
      email: emailAddress.email,
      emailVerified: true,
    },

    authentication,
  };
};