// Kept apart from token.ts (node:crypto) so the browser-side scanner can import it.

/**
 * Accepts either a raw token or a URL that carries one: `/checkin/<token>` and `/unlock/<token>`, or the short
 * printed forms `/C/<token>` (hotel) and `/U/<token>` (place). Anything else is returned trimmed and left to fail
 * resolution — this function decides nothing about validity, it only unwraps the transport.
 */
export function extractQrToken(scanned: string): string {
  const trimmed = scanned.trim();
  const match = trimmed.match(/\/(?:checkin|unlock|C|U)\/([^/?#]+)/);
  return match ? match[1] : trimmed;
}
