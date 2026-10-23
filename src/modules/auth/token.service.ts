import crypto from "crypto";
import { SignJWT } from "jose";
import { env } from "../../config/env.js";

const accessTokenSecret = new TextEncoder().encode(
  env.JWT_ACCESS_SECRET,
);


const ACCESS_TOKEN_EXPIRES_IN = "15m";

export const generateAccessToken = async (
  userId: string,
  sessionId: string,
): Promise<string> => {
  return new SignJWT({
    sessionId,
  })
    .setProtectedHeader({
      alg: "HS256",
      typ: "JWT",
    })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRES_IN)
    .sign(accessTokenSecret);
};

export const generateRefreshToken = (): string => {
  return crypto.randomBytes(64).toString("hex");
};

export const hashRefreshToken = (
  token: string,
): string => {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
};

export const getRefreshTokenExpiry = (): Date => {
  const expiresAt = new Date();

  expiresAt.setDate(
    expiresAt.getDate() + 30,
  );

  return expiresAt;
};