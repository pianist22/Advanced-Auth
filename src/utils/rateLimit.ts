import { redis } from "../lib/redis.js";

export const checkRateLimit = async (
  key: string,
  ttlSeconds: number,
): Promise<boolean> => {
  const result = await redis.set(
    key,
    "1",
    "EX",
    ttlSeconds,
    "NX",
  );

  return result === "OK";
};