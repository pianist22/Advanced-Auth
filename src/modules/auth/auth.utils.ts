import { createHash } from "node:crypto";
import { env } from "../../config/env.js";
import argon2 from "argon2";

export const hashValue = (
  value: string,
): string => {
  return createHash("sha256")
    .update(value)
    .digest("hex");
};

export const verifyPassword = async (
  passwordHash: string | null,
  password: string,
): Promise<boolean> => {
  const hash =
    passwordHash ?? env.DUMMY_PASSWORD_HASH;

  return argon2.verify(hash, password);
};