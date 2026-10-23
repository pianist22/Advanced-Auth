import crypto from "node:crypto";

import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../errors/AppError.js";
import { ERROR_CODES } from "../../errors/errorCodes.js";

import {
  generateRefreshToken,
  hashRefreshToken,
  getRefreshTokenExpiry,
} from "./token.service.js";

import { AuditLogService } from "../audit/auditLog.service.js";
import { AUDIT_EVENTS } from "../audit/auditLog.types.js";

interface RotateRefreshTokenResult {
  userId: string;
  sessionId: string;
  refreshToken: string;
}

export const rotateRefreshToken = async (
  rawRefreshToken: string,
  ipAddress?: string,
  userAgent?: string
): Promise<RotateRefreshTokenResult> => {
  const tokenHash = hashRefreshToken(rawRefreshToken);

  const refreshToken =
    await prisma.refreshToken.findUnique({
      where: {
        tokenHash,
      },
      include: {
        session: {
          include: {
            user: true,
          },
        },
      },
    });

  /*
   * 1. Token must exist
   */
  if (!refreshToken) {
    throw new AppError(
      ERROR_CODES.INVALID_REFRESH_TOKEN,
      "Invalid or expired refresh token",
      401,
    );
  }

  const now = new Date();

  /*
   * 2. Detect refresh-token reuse
   *
   * usedAt means this token has already been
   * consumed during a previous rotation.
   */
  if (refreshToken.usedAt) {
    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.updateMany({
        where: {
          tokenFamilyId: refreshToken.tokenFamilyId,
          revokedAt: null,
        },
        data: {
          revokedAt: now,
        },
      });

      await tx.session.update({
        where: {
          id: refreshToken.sessionId,
        },
        data: {
          revokedAt: now,
        },
      });
    });

    await AuditLogService.log({
    userId: refreshToken.session.user.id,
    event: AUDIT_EVENTS.REFRESH_REUSE_DETECTED,
    ipAddress,
    userAgent,
    metadata: {
        method: "refresh_token",
        reason: "already_used_token",
    },
    });

    throw new AppError(
      ERROR_CODES.INVALID_REFRESH_TOKEN,
      "Session expired. Please sign in again.",
      401,
    );
  }

  /*
   * 3. Token must not be revoked
   */
  if (refreshToken.revokedAt) {
    throw new AppError(
      ERROR_CODES.INVALID_REFRESH_TOKEN,
      "Invalid or expired refresh token",
      401,
    );
  }

  /*
   * 4. Token must not be expired
   */
  if (refreshToken.expiresAt <= now) {
    throw new AppError(
      ERROR_CODES.INVALID_REFRESH_TOKEN,
      "Invalid or expired refresh token",
      401,
    );
  }

  /*
   * 5. Session must still be valid
   */
  const session = refreshToken.session;

  if (
    session.revokedAt ||
    session.expiresAt <= now
  ) {
    throw new AppError(
      ERROR_CODES.INVALID_REFRESH_TOKEN,
      "Invalid or expired refresh token",
      401,
    );
  }

  /*
   * 6. User must still be active
   */
  const user = session.user;

  if (user.status !== "ACTIVE") {
    throw new AppError(
      ERROR_CODES.INVALID_REFRESH_TOKEN,
      "Invalid or expired refresh token",
      401,
    );
  }

  /*
   * 7. Generate the replacement refresh token
   */
  const newRefreshToken =
    generateRefreshToken();

  const newRefreshTokenHash =
    hashRefreshToken(newRefreshToken);

  /*
   * IMPORTANT:
   *
   * The new refresh token uses the existing
   * session expiry.
   *
   * We are currently treating Session.expiresAt
   * as the absolute maximum lifetime of the session.
   */
  const newRefreshTokenExpiresAt =
    session.expiresAt;

  /*
   * 8. Atomically consume the current token
   *
   * Only one concurrent request can successfully
   * change usedAt from NULL → current timestamp.
   */
  const result =
    await prisma.$transaction(async (tx) => {
      const consumedToken =
        await tx.refreshToken.updateMany({
          where: {
            id: refreshToken.id,
            usedAt: null,
            revokedAt: null,
          },
          data: {
            usedAt: now,
          },
        });

      /*
       * Another request may have consumed the
       * same refresh token concurrently.
       */
      if (consumedToken.count !== 1) {
        throw new AppError(
          ERROR_CODES.INVALID_REFRESH_TOKEN,
          "Invalid or expired refresh token",
          401,
        );
      }

      /*
       * Create replacement token in the
       * SAME session and SAME token family.
       */
      const replacement =
        await tx.refreshToken.create({
          data: {
            sessionId: refreshToken.sessionId,
            tokenFamilyId:
              refreshToken.tokenFamilyId,
            tokenHash:
              newRefreshTokenHash,
            expiresAt:
              newRefreshTokenExpiresAt,
          },
        });

      /*
       * Link:
       *
       * R1 → R2
       */
      await tx.refreshToken.update({
        where: {
          id: refreshToken.id,
        },
        data: {
          replacedByTokenId:
            replacement.id,
        },
      });

      /*
       * Mark the session as recently used.
       */
      await tx.session.update({
        where: {
          id: refreshToken.sessionId,
        },
        data: {
          lastUsedAt: now,
        },
      });

      return {
        userId: user.id,
        sessionId: session.id,
      };
    });

  return {
    userId: result.userId,
    sessionId: result.sessionId,
    refreshToken: newRefreshToken,
  };
};

