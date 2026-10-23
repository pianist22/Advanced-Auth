import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(5000),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  REDIS_HOST: z.string().min(1, "REDIS_HOST is required"),

  REDIS_PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(6379),

  REDIS_PASSWORD: z.string().optional(),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
    // not a string 
  DUMMY_PASSWORD_HASH: z.string().min(1, "DUMMY_PASSWORD_HASH is required"),
  MFA_ENCRYPTION_KEY: z.string().min(1, "MFA_ENCRYPTION_KEY is required"),

  RESEND_API_KEY: z.string().optional(),

  EMAIL_FROM: z.string().email().optional(),

  APP_BASE_URL: z.string().url().optional(),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment variables:");

  console.error(
    z.prettifyError(parsedEnv.error),
  );

  process.exit(1);
}

export const env = parsedEnv.data;