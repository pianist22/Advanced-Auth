import { prisma } from "../../lib/prisma.js";

import { AuditLogService } from "../audit/auditLog.service.js";
import { AUDIT_EVENTS } from "../audit/auditLog.types.js";

interface LogoutInput {
  userId: string;
  sessionId: string;
  ipAddress?: string;
  userAgent?: string;
}

export const logout = async ({
  userId,
  sessionId,
  ipAddress,
  userAgent,
}: LogoutInput): Promise<void> => {
  const session = await prisma.session.findFirst({
    where: {
      id: sessionId,
      userId,
    },
    select: {
      id: true,
      revokedAt: true,
    },
  });

  /*
   * Logout is intentionally idempotent.
   *
   * If the session does not exist or has already
   * been revoked, there is nothing left to do.
   */
  if (!session || session.revokedAt) {
    return;
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    /*
     * Revoke the session.
     */
    await tx.session.update({
      where: {
        id: sessionId,
      },
      data: {
        revokedAt: now,
      },
    });

    /*
     * Revoke every refresh token belonging
     * to this session.
     */
    await tx.refreshToken.updateMany({
      where: {
        sessionId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });
  });

  /*
   * Audit after the transaction succeeds.
   */
  await AuditLogService.log({
    userId,
    event: AUDIT_EVENTS.LOGOUT,
    ipAddress,
    userAgent,
    metadata: {
      method: "session",
    },
  });
};