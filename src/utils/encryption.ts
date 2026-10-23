import crypto from "node:crypto";
import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

const getEncryptionKey = (): Buffer => {
  const key = Buffer.from(
    env.MFA_ENCRYPTION_KEY,
    "base64",
  );

  if (key.length !== 32) {
    throw new Error(
      "MFA_ENCRYPTION_KEY must decode to exactly 32 bytes",
    );
  }

  return key;
};

export const encrypt = (plaintext: string): string => {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(
    ALGORITHM,
    key,
    iv,
  );

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
};

export const decrypt = (encryptedValue: string): string => {
  const key = getEncryptionKey();

  const [
    ivBase64,
    authTagBase64,
    encryptedBase64,
  ] = encryptedValue.split(".");

  if (
    !ivBase64 ||
    !authTagBase64 ||
    !encryptedBase64
  ) {
    throw new Error("Invalid encrypted value");
  }

  const iv = Buffer.from(ivBase64, "base64");
  const authTag = Buffer.from(
    authTagBase64,
    "base64",
  );
  const encrypted = Buffer.from(
    encryptedBase64,
    "base64",
  );

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    iv,
  );

  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
};