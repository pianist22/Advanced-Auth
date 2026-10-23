import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import {
  generateAccessToken,
  generateRefreshToken,
  getRefreshTokenExpiry,
  hashRefreshToken,
} from "./token.service.js";

import { AppError } from "../../errors/AppError.js";
import { ERROR_CODES } from "../../errors/errorCodes.js";

interface CreateSessionInput {
  userId: string;
  userAgent?: string;
  ipAddress?: string;
}

interface SessionListItem {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date;
  current: boolean;
}

export const createAuthenticationSessionTx = async (
  tx: Prisma.TransactionClient,
  {
    userId,
    userAgent,
    ipAddress,
  }: CreateSessionInput,
) => {
  const refreshToken = generateRefreshToken();

  const refreshTokenHash =
    hashRefreshToken(refreshToken);

  const tokenFamilyId = crypto.randomUUID();

  const expiresAt = getRefreshTokenExpiry();
  const now = new Date();

  const session = await tx.session.create({
    data: {
      userId,
      userAgent,
      ipAddress,
      expiresAt,
      lastUsedAt: now,
    },
  });

  await tx.refreshToken.create({
    data: {
      sessionId: session.id,
      tokenFamilyId,
      tokenHash: refreshTokenHash,
      expiresAt,
    },
  });

  return {
    sessionId: session.id,
    refreshToken,
  };
};

export const createAuthenticationSession = async (
  input: CreateSessionInput,
) => {
  const sessionData = await prisma.$transaction(
    async (tx) => {
      return createAuthenticationSessionTx(
        tx,
        input,
      );
    },
  );

  const accessToken = await generateAccessToken(
    input.userId,
    sessionData.sessionId,
  );

  return {
    sessionId: sessionData.sessionId,
    accessToken,
    refreshToken: sessionData.refreshToken,
  };
};

export const getActiveSessions = async ({
  userId,
  currentSessionId,
}: {
  userId: string;
  currentSessionId: string;
}): Promise<SessionListItem[]> => {
  const now = new Date();

  const sessions = await prisma.session.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: {
        gt: now,
      },
    },
    select: {
      id: true,
      userAgent: true,
      ipAddress: true,
      createdAt: true,
      lastUsedAt: true,
      expiresAt: true,
    },
    orderBy: {
      // lastUsedAt: "desc",
      createdAt: "desc",
    },
  });

  return sessions.map((session) => ({
    ...session,
    current:
      session.id === currentSessionId,
  }));
};

export const revokeSession = async ({
  userId,
  sessionId,
}: {
  userId: string;
  sessionId: string;
}) => {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const session = await tx.session.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      select: {
        id: true,
      },
    });

    if (!session) {
      throw new AppError(
        ERROR_CODES.SESSION_NOT_FOUND,
        "Session not found",
        404,
      );
    }

    await tx.session.update({
      where: {
        id: session.id,
      },
      data: {
        revokedAt: now,
      },
    });

    await tx.refreshToken.updateMany({
      where: {
        sessionId: session.id,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    return {
      sessionId: session.id,
    };
  });
};

export const revokeAllSessions = async (
  userId: string,
): Promise<void> => {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    await tx.refreshToken.updateMany({
      where: {
        session: {
          userId,
        },
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });
  });
};

export const revokeOtherSessions = async ({
  userId,
  currentSessionId,
}: {
  userId: string;
  currentSessionId: string;
}): Promise<void> => {
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.session.updateMany({
      where: {
        userId,
        id: {
          not: currentSessionId,
        },
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });

    await tx.refreshToken.updateMany({
      where: {
        session: {
          userId,
          id: {
            not: currentSessionId,
          },
        },
        revokedAt: null,
      },
      data: {
        revokedAt: now,
      },
    });
  });
};