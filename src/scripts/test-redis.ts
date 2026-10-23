import { redis } from "../lib/redis.js";

const testRedis = async (): Promise<void> => {
  try {
    const response = await redis.ping();

    console.log("Redis PING response:", response);

    await redis.set("test:key", "hello", "EX", 30);

    const value = await redis.get("test:key");

    console.log("Redis GET response:", value);

    await redis.del("test:key");

    console.log("✅ Redis connection and operations successful");
  } catch (error) {
    console.error("❌ Redis test failed");
    console.error(error);

    process.exitCode = 1;
  } finally {
    await redis.quit();
  }
};

await testRedis();