import {Redis} from "ioredis";
import {env} from "../config/env.js";

const REDIS_HOST = env.REDIS_HOST;
const REDIS_PORT = Number(env.REDIS_PORT);
const REDIS_PASSWORD = env.REDIS_PASSWORD;

if (!REDIS_HOST) {
  throw new Error("REDIS_HOST is not defined");
}

if (!REDIS_PORT) {
  throw new Error("REDIS_PORT is not defined");
}

export const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD || undefined,

  maxRetriesPerRequest: 3,

  retryStrategy(times) {
    const delay = Math.min(times * 100, 3000);

    return delay;
  },
});