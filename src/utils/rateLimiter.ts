import { redis } from "../lib/redis.js";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export const checkRateLimit = async (
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> => {
  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(key, windowSeconds);
  }

  const ttl = await redis.ttl(key);

  if (current > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(ttl, 0),
    };
  }

  return {
    allowed: true,
    remaining: Math.max(limit - current, 0),
    retryAfterSeconds: Math.max(ttl, 0),
  };
};