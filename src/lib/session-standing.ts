/*
 * Whether an Auth.js session may still be used. An Auth.js JWT is a signed snapshot that stays valid until it expires,
 * so ending a session (sign-out, password reset) needs a server-side record: users.sessions_valid_after. Pure, so the
 * rule is tested without Next.js or a database; lib/authorization.ts feeds it the token and the account row.
 */

export type SessionStanding = "valid" | "ended";

/**
 * `authTime` is the sign-in time in epoch MILLISECONDS, stamped into the token once, at sign-in (auth/config.ts).
 *
 * - No account row (deleted after the token was issued): ended.
 * - `sessionsValidAfter` null: no session of this account has ever been ended, so every token is valid, including one
 *   issued before authTime existed.
 * - Otherwise the token must carry an authTime no earlier than the revocation instant. Milliseconds, not seconds: a
 *   whole-second comparison let a token signed in during the same second as a sign-out survive it (found by the
 *   2026-11 fix verification, which signs in and out within a second). Signing back in after a revocation always
 *   happens later, so it stays valid. A token without a millisecond authTime predates this check and cannot prove
 *   when it was issued, so it is ended.
 */
export function sessionStanding(
  token: { authTime?: number | null; passwordVersion?: string | null },
  account: { sessionsValidAfter: Date | null; passwordVersion?: string | null } | null
): SessionStanding {
  if (!account) return "ended";
  // Signed in with a password the account no longer has (it was reset since): ended, regardless of timing. A token from
  // before this field existed carries none and is judged by the time cutoff alone.
  if (token.passwordVersion && account.passwordVersion && token.passwordVersion !== account.passwordVersion) return "ended";
  if (account.sessionsValidAfter === null) return "valid";
  const authTime = token.authTime;
  // Below 1e12 is a seconds-era value (before 2001 in milliseconds): it cannot be compared, so it is ended.
  if (typeof authTime !== "number" || !Number.isFinite(authTime) || authTime < 1e12) return "ended";
  return authTime < account.sessionsValidAfter.getTime() ? "ended" : "valid";
}

/**
 * Whether the session was signed in with a password. Tokens from before Google sign-in (Phase 3) carry no method and were
 * all password sessions; any other value (Google, or something unexpected) is not.
 */
export function isPasswordSession(authMethod: unknown): boolean {
  return authMethod === undefined || authMethod === "password";
}

/** The sign-in time to stamp into a new token, in epoch milliseconds. */
export function authTimeFor(now: Date): number {
  return now.getTime();
}
