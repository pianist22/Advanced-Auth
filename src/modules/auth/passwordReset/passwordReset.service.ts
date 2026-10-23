import { env } from "../../../config/env.js";
import { AppError } from "../../../errors/AppError.js";
import { ERROR_CODES } from "../../../errors/errorCodes.js";
import { logger } from "../../../lib/logger.js";
import { prisma } from "../../../lib/prisma.js";
import { AuditLogService } from "../../audit/auditLog.service.js";
import { AUDIT_EVENTS } from "../../audit/auditLog.types.js";
import { hashValue } from "../auth.utils.js";
import { PasswordResetSecurityService } from "./passwordResetSecurity.service.js";
import { createPasswordResetToken, findValidPasswordResetToken } from "./passwordResetToken.service.js";
import argon2 from "argon2";

const requestPasswordReset = async (
  email: string,
  ipAddress?: string,
  userAgent?: string,
) => {
  const normalizedEmail =
    email.trim().toLowerCase();

    // Rate limiting BEFORE account lookup
    if (ipAddress) {
      await PasswordResetSecurityService
        .checkPasswordResetIpRateLimit(
          ipAddress,
          userAgent,
        );
    }

    await PasswordResetSecurityService
      .checkPasswordResetEmailRateLimit(
        normalizedEmail,
        userAgent,
        ipAddress,
      );


  const emailAddress =
    await prisma.emailAddress.findUnique({
      where: {
        email: normalizedEmail,
      },
      select: {
        userId: true,
        verifiedAt: true,
      },
    });

  /*
   * Never reveal whether the account exists.
   */
  if (!emailAddress) {
    return {
      message:
        "If an account exists with this email, password reset instructions have been sent.",
    };
  }

  /*
   * Don't issue password-reset tokens for
   * unverified email accounts.
   */
  if (!emailAddress.verifiedAt) {
    return {
      message:
        "If an account exists with this email, password reset instructions have been sent.",
    };
  }

  const resetToken =
    await createPasswordResetToken(
      emailAddress.userId,
    );

  // -----------------------------------------
  // 6. Audit
  // -----------------------------------------
  await AuditLogService.log({
    userId: emailAddress.userId,
    event: AUDIT_EVENTS.PASSWORD_RESET_REQUESTED,
    ipAddress,
    userAgent,
  });


  /*
   * Development only.
   *
   * Never log the raw token in production.
   */
    // if (env.NODE_ENV === "development") {
    // logger.debug(
    //     {
    //     userId: emailAddress.userId,
    //     resetToken: resetToken.token,
    //     },
    //     "Password reset token generated",
    // );
    // }

  /*
   * Later:
   *
   * await NotificationService.sendPasswordResetEmail(...)
   */

  return {
    message:
      "If an account exists with this email, password reset instructions have been sent.",
  };
};

const resetPassword = async ({
  token,
  newPassword,
}: {
  token: string;
  newPassword: string;
}) => {
  const resetToken =
    await findValidPasswordResetToken(token);

  const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
    });

  await prisma.$transaction(async (tx) => {
    // 1. Update password
    await tx.passwordCredential.update({
      where: {
        userId: resetToken.userId,
      },
      data: {
        passwordHash,
      },
    });

    // 2. Mark reset token as used
    const consumedToken =
      await tx.passwordResetToken.updateMany({
        where: {
          id: resetToken.id,
          usedAt: null,
          revokedAt: null,
          expiresAt: {
            gt: new Date(),
          },
        },
        data: {
          usedAt: new Date(),
        },
      });

    if (consumedToken.count !== 1) {
      throw new AppError(
        ERROR_CODES.INVALID_PASSWORD_RESET_TOKEN,
        "Invalid or expired password reset token.",
        400,
      );
    }

    // 3. Revoke sessions
    await tx.session.updateMany({
      where: {
        userId: resetToken.userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    // 4. Revoke other password reset tokens
    await tx.passwordResetToken.updateMany({
      where: {
        userId: resetToken.userId,
        id: {
          not: resetToken.id,
        },
        usedAt: null,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  });

  await AuditLogService.log({
    userId: resetToken.userId,
    event: AUDIT_EVENTS.PASSWORD_RESET_SUCCESS,
  });
};

export const PasswordResetService = {
  requestPasswordReset,
  resetPassword,
};