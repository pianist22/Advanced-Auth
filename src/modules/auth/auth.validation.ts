import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters");

export const signupSchema = z.object({
  email: z.email(),
  password: passwordSchema,
});

export const verifyEmailSchema = z.object({
  token: z.string().min(1, "Verification token is required"),
});

export const resendVerificationSchema = z.object({
  email: z.email(),
});

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(
    1,
    "Password is required",
  ),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

export type RefreshTokenInput = z.infer<
  typeof refreshTokenSchema
>;

export const revokeSessionSchema = z.object({
  sessionId: z.uuid(),
});

export type RevokeSessionParams = z.infer<
  typeof revokeSessionSchema
>;