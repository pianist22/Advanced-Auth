import { z } from "zod";
import { passwordSchema } from "../auth.validation.js";

export const forgotPasswordSchema = z.object({
    email: z
      .string()
      .trim()
      .toLowerCase()
});

export const resetPasswordSchema = z.object({
    token: z.string().min(1, "Reset token is required"),
    newPassword: passwordSchema,
});