import { reserveAuthAttempt } from "@/db/operations/auth-rate-limit";
import { consumeResetToken, findUserIdByEmail, issueResetToken } from "@/db/operations/password-reset";
import type { AtlasDatabase } from "@/db/operations/types";
import { authRateLimitKey } from "@/services/rate-limit/auth-policy";
import type { Mailer } from "@/services/mail";
import { newPasswordSchema, resetRequestSchema } from "./schema";
import {
  generateResetToken,
  hashResetToken,
  isWellFormedResetToken,
  resetLink,
  RESET_TOKEN_TTL_MS,
} from "./token";

/*
 * The password-reset rules, free of Next.js so the PGlite tests run this exact code. The server
 * actions in actions.ts only add the request context (client address, origin) and the real mailer.
 */

export const GENERIC_SENT_MESSAGE = "If an account exists for that email, we have sent a link.";

export type RequestResult =
  | { status: "sent" }
  | { status: "unavailable" }
  | { status: "rate_limited" }
  | { status: "invalid"; error: string };

/**
 * Always answers "sent" for a syntactically valid address, whether or not an account exists, and
 * counts the attempt either way so the limits reveal nothing. Mail goes out only for real accounts.
 */
export async function requestPasswordReset(
  deps: { db: AtlasDatabase; mailer: Mailer | null; now: Date; origin: string; clientKey: string },
  rawEmail: string
): Promise<RequestResult> {
  if (!deps.mailer) return { status: "unavailable" };
  const parsed = resetRequestSchema.safeParse({ email: rawEmail });
  if (!parsed.success) return { status: "invalid", error: parsed.error.issues[0]?.message ?? "Enter a valid email" };
  const email = parsed.data.email;

  const emailKey = authRateLimitKey("email", email);
  const ipKey = authRateLimitKey("ip", deps.clientKey);
  // Each limit is checked and recorded in one locked step (reserveAuthAttempt), so concurrent requests cannot all slip
  // under it. The network limit is reserved first: a client over it never spends an address's allowance.
  if (!(await reserveAuthAttempt(deps.db, { scope: "password_reset_ip", keyHash: ipKey, now: deps.now }))) return { status: "rate_limited" };
  if (!(await reserveAuthAttempt(deps.db, { scope: "password_reset_email", keyHash: emailKey, now: deps.now }))) return { status: "rate_limited" };

  const userId = await findUserIdByEmail(deps.db, email);
  if (!userId) return { status: "sent" };

  const token = generateResetToken();
  await issueResetToken(deps.db, {
    userId,
    tokenHash: hashResetToken(token),
    now: deps.now,
    expiresAt: new Date(deps.now.getTime() + RESET_TOKEN_TTL_MS),
  });
  try {
    await deps.mailer.send({
      to: email,
      subject: "Reset your Atlas password",
      text: [
        "Someone asked to reset the password for your Atlas account.",
        "",
        `Open this link within 30 minutes to choose a new password: ${resetLink(deps.origin, token)}`,
        "",
        "If that was not you, you can ignore this email. Your password has not changed.",
      ].join("\n"),
    });
  } catch (error) {
    // Logged for the owner, but the visitor gets the same answer as for an unknown address.
    console.error("Password reset email could not be sent", error instanceof Error ? error.message : error);
  }
  return { status: "sent" };
}

export type CompleteResult =
  | { status: "ok" }
  | { status: "invalid_token" }
  | { status: "invalid"; fieldErrors: { password?: string; confirm?: string } };

export async function completePasswordReset(
  deps: { db: AtlasDatabase; hashPassword: (password: string) => Promise<string>; now: Date },
  input: { token: unknown; password: string; confirm: string }
): Promise<CompleteResult> {
  if (!isWellFormedResetToken(input.token)) return { status: "invalid_token" };
  const parsed = newPasswordSchema.safeParse({ password: input.password, confirm: input.confirm });
  if (!parsed.success) {
    const fieldErrors: { password?: string; confirm?: string } = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as "password" | "confirm";
      fieldErrors[field] ??= issue.message;
    }
    return { status: "invalid", fieldErrors };
  }
  const passwordHash = await deps.hashPassword(parsed.data.password);
  const result = await consumeResetToken(deps.db, { tokenHash: hashResetToken(input.token), passwordHash, now: deps.now });
  return result.ok ? { status: "ok" } : { status: "invalid_token" };
}
