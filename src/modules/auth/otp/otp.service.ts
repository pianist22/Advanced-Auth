import {
  OTP_MAX_ATTEMPTS,
  OTP_TTL_SECONDS,
  OtpPurpose,
} from "./otp.constants.js";

import {
  generateOtp,
  getOtpRedisKey,
  hashOtp,
} from "./otp.utils.js";

import type { CreateOtpInput, StoredOtp } from "./otp.types.js";
import {redis} from "../../../lib/redis.js"
import { normalizePhoneNumber } from "../../../utils/phone.js";
import { hashValue } from "../auth.utils.js";
import { AppError } from "../../../errors/AppError.js";
import { ERROR_CODES } from "../../../errors/errorCodes.js";

export const createOtp = async ({
  purpose,
  phoneNumber,
}: CreateOtpInput) => {
  const normalizedPhone = normalizePhoneNumber(phoneNumber);

  const otp = generateOtp();

  const otpHash = hashValue(otp);

  const redisKey = getOtpRedisKey(
    purpose,
    normalizedPhone,
  );

  const storedOtp: StoredOtp = {
    otpHash,
    attempts: 0,
  };

  await redis.set(
    redisKey,
    JSON.stringify(storedOtp),
    "EX",
    OTP_TTL_SECONDS,
  );

  return {
    otp,
    expiresInSeconds: OTP_TTL_SECONDS,
  };
};

export const verifyOtp = async ({
  purpose,
  phoneNumber,
  otp,
}: {
  purpose: OtpPurpose;
  phoneNumber: string;
  otp: string;
}): Promise<void> => {
  const redisKey = getOtpRedisKey(
    purpose,
    phoneNumber,
  );

  const storedValue =
    await redis.get(redisKey);

  if (!storedValue) {
    throw new AppError(
      ERROR_CODES.OTP_EXPIRED,
      "OTP has expired or is invalid",
      400,
    );
  }

  const storedOtp = JSON.parse(
    storedValue,
  ) as {
    otpHash: string;
    attempts: number;
  };

  if (
    storedOtp.attempts >=
    OTP_MAX_ATTEMPTS
  ) {
    await redis.del(redisKey);

    throw new AppError(
      ERROR_CODES.OTP_MAX_ATTEMPTS,
      "Maximum OTP attempts exceeded",
      429,
    );
  }

  const suppliedOtpHash =
    hashValue(otp);

  if (
    suppliedOtpHash !==
    storedOtp.otpHash
  ) {
    storedOtp.attempts += 1;

    const ttl = await redis.ttl(
      redisKey,
    );

    if (ttl > 0) {
      await redis.set(
        redisKey,
        JSON.stringify(storedOtp),
        "EX",
        ttl,
      );
    }

    throw new AppError(
      ERROR_CODES.INVALID_OTP,
      "Invalid OTP",
      400,
    );
  }

  /*
   * OTP is correct.
   *
   * Delete it immediately so that it
   * cannot be reused.
   */
  await redis.del(redisKey);
};