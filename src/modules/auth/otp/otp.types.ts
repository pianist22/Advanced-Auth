import { OtpPurpose } from "./otp.constants.js";

export interface CreateOtpInput {
  purpose: OtpPurpose;
  phoneNumber: string;
}

export interface StoredOtp {
  otpHash: string;
  attempts: number;
}