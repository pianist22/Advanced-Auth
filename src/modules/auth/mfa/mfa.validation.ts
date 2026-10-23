import {z} from "zod";

export const verifyTotpSchema = z.object({
  code: z.string().regex(
    /^\d{6}$/,
    "Authentication code must contain exactly 6 digits",
  ),
});

export const verifyRecoveryCodeSchema = z.object({
  recoveryCode: z
    .string()
    .trim()
    .regex(
      /^[a-fA-F0-9]{16}$/,
      "Recovery code must contain exactly 16 hexadecimal characters",
    ),
});

export const verifyMfaChallengeSchema = z.object({
  challengeToken: z.string().min(40).max(100),
  method: z.enum(["TOTP", "RECOVERY_CODE"]),
  code: z.string().trim().min(6).max(16),
}).superRefine((data, ctx) => {
  const validCode =
    data.method === "TOTP"
      ? /^\d{6}$/.test(data.code)
      : /^[a-fA-F0-9]{16}$/.test(data.code);

  if (!validCode) {
    ctx.addIssue({
      code: "custom",
      path: ["code"],
      message:
        data.method === "TOTP"
          ? "TOTP code must contain exactly 6 digits"
          : "Recovery code must contain exactly 16 hexadecimal characters",
    });
  }
});


export const disableMfaSchema = z.object({
    password: z.string().min(1, "Password is required"),
    method: z.enum(["TOTP", "RECOVERY_CODE"]),
    code: z.string().trim().min(1, "Verification code is required"),
  })
  .superRefine((data, ctx) => {
    const validCode =
      data.method === "TOTP"
        ? /^\d{6}$/.test(data.code)
        : /^[a-fA-F0-9]{16}$/.test(data.code);

    if (!validCode) {
      ctx.addIssue({
        code: "custom",
        path: ["code"],
        message:
          data.method === "TOTP"
            ? "TOTP code must contain exactly 6 digits"
            : "Recovery code must contain exactly 16 hexadecimal characters",
      });
    }
  });

export const regenerateRecoveryCodesSchema = z.object({
  password: z.string().min(1, "Password is required"),
  code: z.string().regex(
    /^\d{6}$/,
    "Authentication code must contain exactly 6 digits",
  ),
});
