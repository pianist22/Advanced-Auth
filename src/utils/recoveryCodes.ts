import { randomBytes } from "node:crypto";

const RECOVERY_CODE_COUNT = 10;

export const generateRecoveryCodes = () => {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    // 8 random bytes = 64 bits of randomness
    return randomBytes(8).toString("hex").toUpperCase();
  });
};