import { prisma } from "./prisma.js";
import { redis } from "./redis.js";

export const checkDatabaseConnection = async (): Promise<void> => {
  await prisma.$queryRaw`SELECT 1`;
};

export const checkRedisConnection = async (): Promise<void> => {
  await redis.ping();
};