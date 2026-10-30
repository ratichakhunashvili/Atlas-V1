import type { QrCredential, QrPurpose } from "@/db/schema";
import { resolveQrCredential, type QrResolution } from "./resolve";
import { extractQrToken, hashQrToken } from "./token";

export { generateRawQrToken, hashQrToken, extractQrToken, qrTokenHashEquals } from "./token";
export { resolveQrCredential } from "./resolve";
export type { QrResolution, QrResolutionFailure } from "./resolve";

/** Looking a credential up by the hash of what was scanned. Injected so the rules stay testable without a database. */
export type QrCredentialLookup = (tokenHash: string) => Promise<QrCredential | null>;

/**
 * Scanned text -> a usable credential, or a refusal.
 *
 * Everything secret stays on this side: the caller hands in whatever the
 * camera read, and gets back a credential row or a reason. The raw token is
 * hashed here and never stored, logged or echoed, and no lookup is ever done
 * by a client-supplied hotel id, Place id or purpose — the purpose is the
 * one the *calling flow* requires, and it must match what was issued.
 */
export async function resolveScannedQrToken(
  scanned: string,
  expectedPurpose: QrPurpose,
  lookup: QrCredentialLookup,
  now: Date = new Date()
): Promise<QrResolution> {
  const token = extractQrToken(scanned);
  if (!token) return { ok: false, reason: "not_found" };

  const credential = await lookup(hashQrToken(token));
  return resolveQrCredential(credential, expectedPurpose, now);
}
