import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * 16 bytes = 128 bits of entropy. Printed codes cannot be rate-limited at the
 * paper, so the token itself has to be the defence: guessing one of 2^128 is not
 * a feasible attack, which is also why no slow KDF is needed when hashing it
 * (see db/schema/qr-credentials.ts). 128 rather than 256 bits keeps the printed
 * code small (owner decision, 2026-11-15): with the upper-case link it fits a
 * 33x33 QR grid instead of 53x53.
 */
const TOKEN_BYTES = 16;

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32, upper case, no padding: 16 bytes -> 26 characters. */
function toBase32(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(buffer << (5 - bits)) & 31];
  return out;
}

/**
 * Creates a raw credential. Upper-case base32 (A–Z, 2–7) so the whole QR link
 * can use the QR "alphanumeric" mode, which stores it far more compactly, and
 * the value survives a URL and a copy-paste unchanged. Codes issued before
 * (43-character base64url) still resolve: lookup is by hash of whatever was scanned.
 *
 * The return value is the ONLY time this string exists outside the scanner:
 * callers show it once and store `hashToken(raw)`. Never log it, never put it
 * in a server-component payload, never return it from a read.
 */
export function generateRawQrToken(): string {
  return toBase32(randomBytes(TOKEN_BYTES));
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

export { extractQrToken } from "./extract";
