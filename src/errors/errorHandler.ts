import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { ERROR_CODES } from "./errorCodes.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { AppError } from "./AppError.js";

export const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next,
): void => {
  // ----------------------------------------
  // Application errors
  // ----------------------------------------

  if (error instanceof AppError) {
    logger.warn(
      {
        code: error.code,
        statusCode: error.statusCode,
      },
      error.message,
    );

    res.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
      },
    });

    return;
  }

  // ----------------------------------------
  // Zod validation errors
  // ----------------------------------------

  if (error instanceof ZodError) {
    logger.warn(
      {
        code: ERROR_CODES.VALIDATION_ERROR,
      },
      "Request validation failed",
    );

    res.status(400).json({
      success: false,
      error: {
        code: ERROR_CODES.VALIDATION_ERROR,
        message: "Request validation failed",
        details: error.issues.map((issue) => ({
          path: issue.path,
          message: issue.message,
        })),
      },
    });

    return;
  }

  // ----------------------------------------
  // Unknown / unexpected errors
  // ----------------------------------------

  logger.error(
    {
      err: error,
    },
    "Unhandled application error",
  );

  const message =
    env.NODE_ENV === "production"
      ? "Internal server error"
      : error instanceof Error
        ? error.message
        : "Unknown error";

  res.status(500).json({
    success: false,
    error: {
      code: ERROR_CODES.INTERNAL_SERVER_ERROR,
      message,
    },
  });
};