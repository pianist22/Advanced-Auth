export const OTP_LENGTH = 6;

export const OTP_TTL_SECONDS = 5 * 60;

export const OTP_MAX_ATTEMPTS = 5;

export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export const OTP_PURPOSE = {
  PHONE_VERIFICATION: "phone-verification",
  LOGIN: "login",
} as const;

export type OtpPurpose =
  (typeof OTP_PURPOSE)[keyof typeof OTP_PURPOSE];