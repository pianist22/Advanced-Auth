import { z } from "zod";

export const addPhoneSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .min(1, "Phone number is required"),
});

export type AddPhoneInput = z.infer<
  typeof addPhoneSchema
>;

export const requestPhoneVerificationOtpSchema = z.object({});

export const verifyPhoneSchema = z.object({
  otp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "OTP must be a 6-digit number"),
});

export type VerifyPhoneInput = z.infer<
  typeof verifyPhoneSchema
>;