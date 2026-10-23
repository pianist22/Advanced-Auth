import { app } from "./app.js";

import {
  checkDatabaseConnection,
  checkRedisConnection,
} from "./lib/database.js";

import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";
import { logger } from "./lib/logger.js";
import { env } from "./config/env.js";

const PORT = env.PORT;

const startServer = async (): Promise<void> => {
  try {
    logger.info("Starting application");

    await checkDatabaseConnection();

    logger.info("PostgreSQL connection successful");

    await checkRedisConnection();

    logger.info("Redis connection successful");

    const server = app.listen(PORT, () => {
      logger.info(
        {
          port: PORT,
        },
        "Server started",
      );
    });

    let isShuttingDown = false;

    const shutdown = async (signal: string): Promise<void> => {
      if (isShuttingDown) {
        logger.warn("Shutdown already in progress");
        return;
      }

      isShuttingDown = true;

      logger.info(
        {
          signal,
        },
        "Graceful shutdown initiated",
      );

      server.close(async (error) => {
        if (error) {
          logger.error(
            {
              error,
            },
            "Error closing HTTP server",
          );

          process.exit(1);
        }

        logger.info("HTTP server closed");

        try {
          await redis.quit();

          logger.info("Redis disconnected");

          await prisma.$disconnect();

          logger.info("Prisma disconnected");

          logger.info("Graceful shutdown completed");

          process.exit(0);
        } catch (error) {
          logger.error(
            {
              error,
            },
            "Error during shutdown",
          );

          process.exit(1);
        }
      });
    };

    process.on("SIGINT", () => {
      void shutdown("SIGINT");
    });

    process.on("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
  } catch (error) {
    logger.error(
      {
        error,
      },
      "Application startup failed",
    );

    process.exit(1);
  }
};

void startServer();