import { createHash, randomBytes } from "node:crypto";

/** Reset links work for 30 minutes. */
export const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;

/** 32 random bytes as base64url: 43 characters, opaque, unguessable. */
export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The only form of the token that is ever stored. */
export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Cheap shape check so junk never reaches the database. */
export function isWellFormedResetToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

export function resetLink(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/reset-password?token=${token}`;
}
