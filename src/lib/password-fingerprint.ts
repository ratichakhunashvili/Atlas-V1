import { createHash } from "node:crypto";

/*
 * A short fingerprint of the account's password hash, stamped into the session token at sign-in and compared with the
 * account's CURRENT hash on every check (lib/authorization.ts). A password reset changes the hash, so every session
 * signed in with the old password ends, whatever order the sign-in and the reset finished in. That closes the race a
 * time cutoff alone cannot: a sign-in that read the old hash before the reset and stamped its token after it
 * (follow-up review, 2026-11-13). Node-only; the token itself is encrypted by Auth.js.
 */
/** Null for an account without a password (Google only): there is no password version to compare. */
export function passwordFingerprint(passwordHash: string | null): string | null {
  if (passwordHash === null) return null;
  return createHash("sha256").update(passwordHash).digest("base64url").slice(0, 22);
}
