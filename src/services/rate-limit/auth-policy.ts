import { createHash } from "node:crypto";
import type { AuthRateLimitScope } from "@/db/schema";

/**
 * Limits for sign-in and sign-up, the two screens used before anyone is signed in.
 *
 * Rolling windows, like the signed-in limits in policy.ts: a guest who mistypes their password
 * five times can try again a few minutes later, with nothing for anyone to unlock.
 */
export type AuthRateLimitRule = { limit: number; windowSeconds: number };

export const AUTH_RATE_LIMIT_RULES: Record<AuthRateLimitScope, AuthRateLimitRule> = {
  // Failed sign-ins for one email: stops password guessing against one account.
  sign_in_email: { limit: 5, windowSeconds: 15 * 60 },
  // Failed sign-ins from one network: stops one device trying many emails. Loose on purpose,
  // because every guest on a hotel's wifi shares the same address.
  sign_in_ip: { limit: 50, windowSeconds: 15 * 60 },
  // Every sign-up attempt from one network: stops scripted account creation.
  sign_up_ip: { limit: 20, windowSeconds: 60 * 60 },
  // Reset-link requests for one address: stops mail-bombing one inbox. Counted for every address,
  // known or not, so the limit never reveals whether an account exists.
  password_reset_email: { limit: 3, windowSeconds: 60 * 60 },
  // Reset-link requests from one network: loose, as hotel wifi is shared.
  password_reset_ip: { limit: 20, windowSeconds: 60 * 60 },
};

/** The stored key: a hash, so the table never holds a readable email or IP address. */
export function authRateLimitKey(kind: "email" | "ip", value: string): string {
  return createHash("sha256").update(`${kind}:${value.trim().toLowerCase()}`).digest("hex");
}

/** `attemptsInWindow` is the count before this attempt: a limit of 5 permits the 5th and refuses the 6th. */
export function isWithinAuthLimit(scope: AuthRateLimitScope, attemptsInWindow: number): boolean {
  return attemptsInWindow < AUTH_RATE_LIMIT_RULES[scope].limit;
}

export function authWindowStart(scope: AuthRateLimitScope, now: Date): Date {
  return new Date(now.getTime() - AUTH_RATE_LIMIT_RULES[scope].windowSeconds * 1000);
}

/** Same wording for every limit, so the message never reveals whether an email has an account. */
export function authRateLimitedMessage(): string {
  return "Too many attempts. Wait a few minutes and try again.";
}
