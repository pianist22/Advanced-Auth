import crypto from "crypto";

export const generateSecureToken = (
  bytes = 32,
): string => {
  return crypto.randomBytes(bytes).toString("hex");
};

export const hashToken = (
  token: string,
): string => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};