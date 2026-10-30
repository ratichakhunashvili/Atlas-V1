import type { QrCredential, QrPurpose } from "@/db/schema";

export type QrResolutionFailure = "not_found" | "wrong_purpose" | "revoked" | "expired";

export type QrResolution =
  | { ok: true; credential: QrCredential }
  | { ok: false; reason: QrResolutionFailure };

/**
 * The one place that decides whether a scanned credential may be used, kept
 * pure so every rule is testable without a database.
 *
 * Order matters only for what we learn, not for what we allow: all four
 * outcomes are reported to the caller as the same generic "invalid code"
 * message, because telling a scanner *why* a code failed tells an attacker
 * which codes exist. The distinct reasons are for logs and tests.
 *
 * `expiresAt` is exclusive at the boundary: a credential is valid up to and
 * including its expiry instant, and dead after it.
 */
export function resolveQrCredential(
  credential: QrCredential | null,
  expectedPurpose: QrPurpose,
  now: Date
): QrResolution {
  if (!credential) return { ok: false, reason: "not_found" };

  // Purpose is checked against the stored row, never against the route that
  // happened to receive the scan: a hotel-entry token presented to the Place
  // check-in path fails here, and vice versa.
  if (credential.purpose !== expectedPurpose) return { ok: false, reason: "wrong_purpose" };

  if (credential.revokedAt !== null) return { ok: false, reason: "revoked" };

  if (credential.expiresAt !== null && credential.expiresAt.getTime() < now.getTime()) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, credential };
}
