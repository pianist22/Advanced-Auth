import type {
  NextFunction,
  Request,
  Response,
} from "express";

import { jwtVerify } from "jose";

import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../errors/AppError.js";
import { ERROR_CODES } from "../errors/errorCodes.js";

const accessTokenSecret = new TextEncoder().encode(
  env.JWT_ACCESS_SECRET,
);

export type AuthenticatedRequest = Request & {
  auth: {
    userId: string;
    sessionId: string;
  };
};

export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const authorization =
      req.get("authorization");

    /*
     * Authorization header must be:
     *
     * Bearer <JWT>
     */
    if (!authorization) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        "Authentication required",
        401,
      );
    }

    const [scheme, token] =
      authorization.split(" ");

    if (
      scheme !== "Bearer" ||
      !token
    ) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        "Authentication required",
        401,
      );
    }

    /*
     * Verify JWT signature + expiration.
     */
    const { payload } =
      await jwtVerify(
        token,
        accessTokenSecret,
        {
          algorithms: ["HS256"],
        },
      );

    /*
     * Validate required JWT claims.
     */
    if (
      typeof payload.sub !== "string" ||
      typeof payload.sessionId !== "string"
    ) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        "Invalid access token",
        401,
      );
    }

    const userId = payload.sub;
    const sessionId =
      payload.sessionId;

    /*
     * Verify that this session still exists
     * and belongs to this user.
     */
    const session =
      await prisma.session.findFirst({
        where: {
          id: sessionId,
          userId,
        },
      });

    if (!session) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        "Invalid authentication session",
        401,
      );
    }

    /*
     * Session may have been revoked after
     * the JWT was issued.
     */
    if (session.revokedAt) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        "Authentication session has been revoked",
        401,
      );
    }

    /*
     * Session has an absolute expiration.
     */
    if (session.expiresAt <= new Date()) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        "Authentication session has expired",
        401,
      );
    }

    /*
     * Verify the user is still active.
     */
    const user =
      await prisma.user.findUnique({
        where: {
          id: userId,
        },
        select: {
          id: true,
          status: true,
        },
      });

    if (
      !user ||
      user.status !== "ACTIVE"
    ) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        "User is not authorized",
        401,
      );
    }

    const now = new Date();
    
    const shouldUpdateLastUsedAt = !session.lastUsedAt || (now.getTime() - session.lastUsedAt.getTime()) > 5 * 60 * 1000; // 5 minutes

    if(shouldUpdateLastUsedAt) {
      await prisma.session.update({
        where: {
          id: sessionId,
        },
        data: {
          lastUsedAt: new Date(),
        },
      });
    }

    /*
     * Attach authentication context
     * to the request.
     */
    
    req.auth = {
      userId,
      sessionId,
    };

    next();
  } catch (error) {
    /*
     * jose throws errors for:
     *
     * - invalid signature
     * - expired JWT
     * - malformed JWT
     * - invalid JWT structure
     */
    if (error instanceof AppError) {
      next(error);
      return;
    }

    next(
      new AppError(
        ERROR_CODES.UNAUTHORIZED,
        "Invalid access token",
        401,
      ),
    );
  }
};