import { createHmac, randomUUID } from "node:crypto";
import { hashQrToken, qrTokenHashEquals, toBase32 } from "./token";

/*
 * Permanent QR codes (owner decision, 2026-11-16): each place and hotel has one code that never changes, and an admin
 * can download or print it again at any time.
 *
 * The code is not stored. It is CALCULATED from a server-side secret (QR_CODE_SECRET) and the id of its credential
 * row: HMAC-SHA256(secret, "atlas-qr:v1:<credential id>"), first 16 bytes (128 bits), upper-case base32 (26
 * characters, like the random codes). The database still stores only the hash of the code (CLAUDE.md), so a database
 * leak alone reveals no code; recalculating one needs the secret as well.
 *
 * The same row always gives the same code, so the code stays the same for as long as that row is active. Replacing a
 * code (an emergency: a stolen or misused code) revokes the row and creates a new one, which gives a new code.
 *
 * Codes issued before this (random, 2026-11-15 and earlier) cannot be recalculated: Atlas never kept them. They keep
 * working until replaced; isPermanentCredential tells the two apart.
 */

export const QR_CODE_SECRET_MIN_LENGTH = 32;

/** The server's QR secret, or null when it is missing or too short (then no permanent code can be made or shown). */
export function qrCodeSecret(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.QR_CODE_SECRET?.trim();
  return secret && secret.length >= QR_CODE_SECRET_MIN_LENGTH ? secret : null;
}

export const QR_SECRET_MISSING_MESSAGE =
  "QR codes aren't set up on this server yet: QR_CODE_SECRET is missing. Add it in the hosting settings, then try again.";

export function derivePermanentQrToken(secret: string, credentialId: string): string {
  const digest = createHmac("sha256", secret).update(`atlas-qr:v1:${credentialId}`, "utf8").digest();
  return toBase32(digest.subarray(0, 16));
}

/** A new credential row's id and its permanent code. The caller stores the id and hashQrToken(rawToken), never the code. */
export function newPermanentQrCredential(secret: string): { id: string; rawToken: string } {
  const id = randomUUID();
  return { id, rawToken: derivePermanentQrToken(secret, id) };
}

/** The permanent code of an existing credential row, or null when the row holds an older random code. */
export function revealPermanentQrToken(secret: string, credential: { id: string; tokenHash: string }): string | null {
  const rawToken = derivePermanentQrToken(secret, credential.id);
  return qrTokenHashEquals(hashQrToken(rawToken), credential.tokenHash) ? rawToken : null;
}
