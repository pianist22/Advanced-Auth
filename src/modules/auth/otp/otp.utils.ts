import crypto from "node:crypto";
import { hashValue } from "../../auth/auth.utils.js";
import {
  OTP_LENGTH,
  type OtpPurpose,
} from "./otp.constants.js";

export const generateOtp = (): string => {
  const max = 10 ** OTP_LENGTH;

  const otp = crypto.randomInt(0, max);

  return otp.toString().padStart(OTP_LENGTH, "0");
};

export const hashOtp = (otp: string): string => {
  return hashValue(otp);
};

export const getOtpRedisKey = (
  purpose: OtpPurpose,
  phoneNumber: string,
): string => {
  const phoneHash = hashValue(phoneNumber);

  return `auth:otp:${purpose}:${phoneHash}`;
};

export const getOtpCooldownKey = (
  purpose: OtpPurpose,
  phoneNumber: string,
): string => {
  const phoneHash = hashValue(phoneNumber);

  return `auth:otp:cooldown:${purpose}:${phoneHash}`;
};