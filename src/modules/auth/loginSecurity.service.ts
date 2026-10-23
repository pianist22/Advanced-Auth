import { AppError } from "../../errors/AppError.js";
import { ERROR_CODES } from "../../errors/errorCodes.js";
import { redis } from "../../lib/redis.js";
import { checkRateLimit } from "../../utils/rateLimiter.js";
import { hashValue } from "./auth.utils.js";
import { AuditLogService } from "../audit/auditLog.service.js";
import { AUDIT_EVENTS } from "../audit/auditLog.types.js";

const LOGIN_IP_LIMIT = 20;
const LOGIN_IP_WINDOW_SECONDS = 15 * 60;

const LOGIN_EMAIL_LIMIT = 10;
const LOGIN_EMAIL_WINDOW_SECONDS = 15 * 60;

export const LOGIN_FAILURE_LIMIT = 5;
export const LOGIN_FAILURE_WINDOW_SECONDS = 15 * 60;
const LOGIN_BLOCK_SECONDS = 15 * 60;

// Ip Based Login Rate Limiting
export const checkLoginIpRateLimit = async (
  ipAddress: string,
  userAgent?: string,
): Promise<void> => {
  const key = `auth:rate-limit:login:ip:${ipAddress}`;

  const result = await checkRateLimit(
    key,
    LOGIN_IP_LIMIT,
    LOGIN_IP_WINDOW_SECONDS,
  );

  if (!result.allowed) {
    await AuditLogService.log({
      event: AUDIT_EVENTS.LOGIN_RATE_LIMITED,
      ipAddress,
      userAgent,
      metadata: {
        type: "ip",
      },
    });

    throw new AppError(
      ERROR_CODES.RATE_LIMITED,
      "Too many login attempts. Please try again later.",
      429,
    );
  }
};

// Email based Login Rate Limiting
export const checkLoginEmailRateLimit = async (
  email: string,
  userAgent?: string,
  ipAddress?: string,
): Promise<void> => {
  const emailHash = hashValue(email);

  const key =`auth:rate-limit:login:email:${emailHash}`;

  const result = await checkRateLimit(
    key,
    LOGIN_EMAIL_LIMIT,
    LOGIN_EMAIL_WINDOW_SECONDS,
  );

  if (!result.allowed) {
    await AuditLogService.log({
      event: AUDIT_EVENTS.LOGIN_RATE_LIMITED,
      ipAddress,
      userAgent,
      metadata: {
        type: "email",
      },
    });

    throw new AppError(
      ERROR_CODES.RATE_LIMITED,
      "Too many login attempts. Please try again later.",
      429,
    );
  }
};

// Failed Login Counter
export const recordFailedLogin = async (
  email: string,
): Promise<boolean> => {
  const emailHash = hashValue(email);

  const key =
    `auth:login:failed:${emailHash}`;

  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(
      key,
      LOGIN_FAILURE_WINDOW_SECONDS,
    );
  }

  return current >= LOGIN_FAILURE_LIMIT;
};

// Temporary Lockout for Failed Logins
export const blockLoginTemporarily = async (
  email: string,
): Promise<void> => {
  const emailHash = hashValue(email);

  await redis.set(
    `auth:login:blocked:${emailHash}`,
    "1",
    "EX",
    LOGIN_BLOCK_SECONDS,
  );
};

// Check if the user is temporarily blocked from logging in
export const isLoginTemporarilyBlocked = async (
  email: string,
  ipAddress?: string,
  userAgent?: string,
): Promise<boolean> => {
  const emailHash = hashValue(email);

  const exists = await redis.exists(
    `auth:login:blocked:${emailHash}`,
  );

  const answer = exists === 1;
  if(answer){
      await AuditLogService.log({
        event: AUDIT_EVENTS.LOGIN_RATE_LIMITED,
        ipAddress,
        userAgent,
        metadata: {
          type: "temporary_block",
        },
      });
      return answer;
  }
  return answer;
};

// Clear the failed login counter and Blocked status for a user after a successful login
export const clearLoginFailures = async (
  email: string,
): Promise<void> => {
  const emailHash = hashValue(email);

  await redis.del(
    `auth:login:failed:${emailHash}`,
    `auth:login:blocked:${emailHash}`,
  );
};


export const LoginSecurityService = {
  checkLoginIpRateLimit,
  checkLoginEmailRateLimit,
  recordFailedLogin,
  blockLoginTemporarily,
  isLoginTemporarilyBlocked,
  clearLoginFailures,
};


