import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * 32 bytes = 256 bits of entropy. Printed codes cannot be rate-limited at the
 * paper, so the token itself has to be the defence: guessing one is not a
 * feasible attack at this size, which is also why no slow KDF is needed when
 * hashing it (see db/schema/qr-credentials.ts).
 */
const TOKEN_BYTES = 32;

/**
 * Creates a raw credential. base64url so the value survives a QR payload, a
 * URL and a copy-paste unchanged — no padding, no characters needing escaping.
 *
 * The return value is the ONLY time this string exists outside the scanner:
 * callers show it once and store `hashToken(raw)`. Never log it, never put it
 * in a server-component payload, never return it from a read.
 */
export function generateRawQrToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** The stored form. Stable and deterministic, so a scan resolves with a single indexed lookup. */
export function hashQrToken(rawToken: string): string {
  return createHash("sha256").update(rawToken.trim(), "utf8").digest("hex");
}

/**
 * Constant-time comparison of two hashes. The lookup itself is by hash, so
 * this is belt-and-braces for any path that compares a candidate directly;
 * it also keeps a length mismatch from short-circuiting into a timing signal.
 */
export function qrTokenHashEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Accepts either a raw token or a URL that carries one (`/checkin/<token>`,
 * which is what the existing guest route serves). Anything else is returned
 * trimmed and left to fail resolution — this function decides nothing about
 * validity, it only unwraps the transport.
 */
export function extractQrToken(scanned: string): string {
  const trimmed = scanned.trim();
  const match = trimmed.match(/\/(?:checkin|unlock)\/([^/?#]+)/);
  return match ? match[1] : trimmed;
}
