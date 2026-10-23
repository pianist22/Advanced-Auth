import { AppError } from "../../../errors/AppError.js";
import { ERROR_CODES } from "../../../errors/errorCodes.js";
import { checkRateLimit } from "../../../utils/rateLimiter.js";
import { AuditLogService } from "../../audit/auditLog.service.js";
import { AUDIT_EVENTS } from "../../audit/auditLog.types.js";
import { hashValue } from "../auth.utils.js";

const PASSWORD_RESET_IP_LIMIT = 20;
const PASSWORD_RESET_IP_WINDOW_SECONDS = 15 * 60;

const PASSWORD_RESET_EMAIL_LIMIT = 5;
const PASSWORD_RESET_EMAIL_WINDOW_SECONDS = 15 * 60;

export const checkPasswordResetIpRateLimit = async (
  ipAddress: string,
  userAgent?: string,
): Promise<void> => {
  const ipHash = hashValue(ipAddress);

  const key =
    `auth:rate-limit:password-reset:ip:${ipHash}`;

  const result = await checkRateLimit(
    key,
    PASSWORD_RESET_IP_LIMIT,
    PASSWORD_RESET_IP_WINDOW_SECONDS,
  );

  if (!result.allowed) {
    await AuditLogService.log({
      event: AUDIT_EVENTS.PASSWORD_RESET_RATE_LIMITED,
      ipAddress,
      userAgent,
      metadata: {
        type: "ip",
      },
    });

    throw new AppError(
      ERROR_CODES.RATE_LIMITED,
      "Too many password reset requests. Please try again later.",
      429,
    );
  }
};

export const checkPasswordResetEmailRateLimit = async (
  email: string,
  userAgent?: string,
  ipAddress?: string,
): Promise<void> => {
  const emailHash = hashValue(email);

  const key =
    `auth:rate-limit:password-reset:email:${emailHash}`;

  const result = await checkRateLimit(
    key,
    PASSWORD_RESET_EMAIL_LIMIT,
    PASSWORD_RESET_EMAIL_WINDOW_SECONDS,
  );

  if (!result.allowed) {
    await AuditLogService.log({
      event: AUDIT_EVENTS.PASSWORD_RESET_RATE_LIMITED,
      ipAddress,
      userAgent,
      metadata: {
        type: "email",
      },
    });

    throw new AppError(
      ERROR_CODES.RATE_LIMITED,
      "Too many password reset requests. Please try again later.",
      429,
    );
  }
};

export const PasswordResetSecurityService = {
  checkPasswordResetIpRateLimit,
  checkPasswordResetEmailRateLimit,
};