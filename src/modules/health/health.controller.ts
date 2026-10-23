import type { Request, Response } from "express";

import {
  checkDatabaseConnection,
  checkRedisConnection,
} from "../../lib/database.js";

import { logger } from "../../lib/logger.js";

export const getLiveness = (
  _req: Request,
  res: Response,
): void => {
  res.status(200).json({
    success: true,
    status: "ok",
  });
};

export const getReadiness = async (
  _req: Request,
  res: Response,
): Promise<void> => {
  const checks = {
    postgres: "ok",
    redis: "ok",
  };

  let isReady = true;

  try {
    await checkDatabaseConnection();
  } catch (error) {
    isReady = false;
    checks.postgres = "failed";

    logger.error(
      {
        error,
      },
      "PostgreSQL readiness check failed",
    );
  }

  try {
    await checkRedisConnection();
  } catch (error) {
    isReady = false;
    checks.redis = "failed";

    logger.error(
      {
        error,
      },
      "Redis readiness check failed",
    );
  }

  if (!isReady) {
    res.status(503).json({
      success: false,
      status: "not_ready",
      checks,
    });

    return;
  }

  res.status(200).json({
    success: true,
    status: "ready",
    checks,
  });
};