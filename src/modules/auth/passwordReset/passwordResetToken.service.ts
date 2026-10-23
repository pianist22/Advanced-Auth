import crypto from "node:crypto";

import { prisma } from "../../../lib/prisma.js";
import { PASSWORD_RESET_TOKEN_EXPIRY_MINUTES } from "./passwordResetToken.constant.js";
import { AppError } from "../../../errors/AppError.js";
import { ERROR_CODES } from "../../../errors/errorCodes.js";

export const generatePasswordResetToken = (): string => {
  return crypto.randomBytes(32).toString("hex");
};

export const hashPasswordResetToken = (
  token: string,
): string => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};

export const getPasswordResetTokenExpiry = (): Date => {
    const expiresAt = new Date();

    expiresAt.setMinutes(
      expiresAt.getMinutes() +
        PASSWORD_RESET_TOKEN_EXPIRY_MINUTES,
    );

    return expiresAt;
};

export const createPasswordResetToken =
  async (userId: string) => {
    /*
     * Invalidate previous active reset tokens.
     */
    await prisma.passwordResetToken.updateMany({
      where: {
        userId,
        usedAt: null,
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        revokedAt: new Date(),
      },
    });

    /*
     * Generate a new cryptographically secure token.
     */
    const token =
      generatePasswordResetToken();

    /*
     * Store only the hash.
     */
    const tokenHash =
      hashPasswordResetToken(token);

    const expiresAt =
      getPasswordResetTokenExpiry();

    await prisma.passwordResetToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
      },
    });

    /*
     * Raw token is returned because it will
     * eventually be sent to the user.
     */
    return {
      token,
      expiresAt,
    };
  };

export const findValidPasswordResetToken = async (
  token: string,
) => {
  const tokenHash = hashPasswordResetToken(token);

  const resetToken =
    await prisma.passwordResetToken.findUnique({
      where: {
        tokenHash,
      },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
      },
    });

  if (!resetToken) {
    throw new AppError(
      ERROR_CODES.INVALID_PASSWORD_RESET_TOKEN,
      "Invalid or expired password reset token.",
      400,
    );
  }

  if (resetToken.usedAt) {
    throw new AppError(
      ERROR_CODES.INVALID_PASSWORD_RESET_TOKEN,
      "Invalid or expired password reset token.",
      400,
    );
  }

  if (resetToken.revokedAt) {
    throw new AppError(
      ERROR_CODES.INVALID_PASSWORD_RESET_TOKEN,
      "Invalid or expired password reset token.",
      400,
    );
  }

  if (resetToken.expiresAt <= new Date()) {
    throw new AppError(
      ERROR_CODES.INVALID_PASSWORD_RESET_TOKEN,
      "Invalid or expired password reset token.",
      400,
    );
  }

  return resetToken;
};
