import type { NextFunction, Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync.js";
import { sendSuccess } from "../../utils/apiResponse.js";
import * as AuthService from "./auth.service.js";
import { EmailVerificationService } from "./emailVerification.service.js";

import { rotateRefreshToken } from "./refreshToken.service.js";
import { generateAccessToken } from "./token.service.js";
import { AuditLogService } from "../audit/auditLog.service.js";
import { AUDIT_EVENTS } from "../audit/auditLog.types.js";
import { RefreshTokenInput } from "./auth.validation.js";
import { logout } from "./logout.service.js";
import { ERROR_CODES } from "../../errors/errorCodes.js";
import { AppError } from "../../errors/AppError.js";
import { getActiveSessions, revokeAllSessions, revokeOtherSessions, revokeSession } from "./session.service.js";
import { PasswordResetService } from "./passwordReset/passwordReset.service.js";

const signupHandler = catchAsync(
  async (req: Request, res: Response) => {
    const user = await AuthService.signup(req.body);

    return sendSuccess(res, user, 201);
  },
);

export const verifyEmailHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result =
      await EmailVerificationService.verifyEmail(
        req.body.token,
        req.get("user-agent"),
        req.ip,
      );

    return sendSuccess(res, result);
  },
);

export const resendEmailVerificationHandler = catchAsync(
  async (req: Request, res: Response) => {
    await EmailVerificationService.resendEmailVerification(
      req.body.email,
    );

    return sendSuccess(res, {
      message:
        "If an unverified account exists, a verification email has been sent.",
    });
  },
);

const loginHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result =
      await AuthService.login(
        req.body,
        req.get("user-agent"),
        req.ip,
      );

    return sendSuccess(res, result);
  },
);

const refreshTokenController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const {
      refreshToken,
    } = req.body as RefreshTokenInput;

    const rotation =
      await rotateRefreshToken(
        refreshToken,
        req.ip,
        req.get("user-agent"),
      );
    const accessToken =
      await generateAccessToken(
        rotation.userId,
        rotation.sessionId,
      );

    await AuditLogService.log({
      userId: rotation.userId,
      event: AUDIT_EVENTS.REFRESH_SUCCESS,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      metadata: {
        method: "refresh_token",
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        accessToken,
        refreshToken:
          rotation.refreshToken,
      },
    });
  } catch (error) {
    next(error);
  }
};

const logoutController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.auth) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        "Authentication required",
        401,
      );
    }

    await logout({
      userId: req.auth.userId,
      sessionId: req.auth.sessionId,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.status(200).json({
      success: true,
      data: {
        message: "Successfully logged out",
      },
    });
  } catch (error) {
    next(error);
  }
};

const getSessionsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.auth) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        "Authentication required",
        401,
      );
    }

    const sessions =
      await getActiveSessions({
        userId: req.auth.userId,
        currentSessionId:
          req.auth.sessionId,
      });

    return res.status(200).json({
      success: true,
      data: {
        sessions,
      },
    });
  } catch (error) {
    next(error);
  }
};

const revokeSessionController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.auth) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        "Authentication required",
        401,
      );
    }

    const sessionId = req.params.sessionId;

    if (typeof sessionId !== "string" || !sessionId) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        "Session ID is required",
        400,
      );
    }

    const revokedSession = await revokeSession({
      userId: req.auth.userId,
      sessionId,
    });

    await AuditLogService.log({
      userId: req.auth.userId,
      event: AUDIT_EVENTS.SESSION_REVOKED,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      metadata: {
        sessionId: revokedSession.sessionId,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        message: "Session revoked successfully",
      },
    });
  } catch (error) {
    next(error);
  }
};

const logoutAllController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.auth) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        "Authentication required",
        401,
      );
    }

    await revokeAllSessions(req.auth.userId);

    await AuditLogService.log({
      userId: req.auth.userId,
      event: AUDIT_EVENTS.LOGOUT_ALL,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      metadata: {
        method: "logout_all",
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        message: "Logged out from all sessions successfully",
      },
    });
  } catch (error) {
    next(error);
  }
};

const revokeOtherSessionsController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    if (!req.auth) {
      throw new AppError(
        ERROR_CODES.UNAUTHORIZED,
        "Authentication required",
        401,
      );
    }

    await revokeOtherSessions({
      userId: req.auth.userId,
      currentSessionId: req.auth.sessionId,
    });

    await AuditLogService.log({
      userId: req.auth.userId,
      event: AUDIT_EVENTS.SESSIONS_REVOKED,
      ipAddress: req.ip,
      userAgent: req.get("user-agent"),
      metadata: {
        method: "revoke_other_sessions",
        currentSessionId: req.auth.sessionId,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        message: "Other sessions revoked successfully",
      },
    });
  } catch (error) {
    next(error);
  }
};

const forgotPasswordHandler = catchAsync(
  async (req: Request, res: Response) => {
    const result =
      await PasswordResetService.requestPasswordReset(
        req.body.email,
        req.ip,
        req.get("user-agent") ?? undefined,
      );

    return sendSuccess(res, result);
  },
);

const resetPasswordHandler = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { token, newPassword } = req.body;

    await PasswordResetService.resetPassword({
      token,
      newPassword,
    });

    return res.status(200).json({
      success: true,
      data: {
        message:
          "Password has been reset successfully. Please log in again.",
      },
    });
  } catch (error) {
    next(error);
  }
};



export const AuthController = {
  signup: signupHandler,
  verifyEmail: verifyEmailHandler,
  resendEmailVerification: resendEmailVerificationHandler,
  login: loginHandler,
  refresh: refreshTokenController,
  logout: logoutController,
  getSessions: getSessionsController,
  revokeSession: revokeSessionController,
  logoutAll: logoutAllController,
  revokeOtherSessions: revokeOtherSessionsController,
  forgotPassword: forgotPasswordHandler,
  resetPassword: resetPasswordHandler,
};