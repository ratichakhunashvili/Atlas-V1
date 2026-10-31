/**
 * What the browser says about where the guest is, and whether it is good enough
 * to complete a stop.
 *
 * **This does not prevent GPS spoofing, and nothing here should be described as
 * if it does.** Every value is self-declared by the guest's own device: a browser
 * extension, a developer-tools override or a patched client can report any
 * coordinates, any accuracy and any timestamp it likes. What these rules do is
 * narrower and still worth having — they reject the ordinary failures that make a
 * genuine reading meaningless:
 *
 *  - a fix so imprecise that "within 150 m" tells us nothing;
 *  - a stale fix from where the guest used to be;
 *  - a reading from the future, which no honest clock produces.
 *
 * Treat a passing result as "the device's own account is internally plausible",
 * never as proof of presence.
 */

/** A fix vaguer than this cannot support a 150 m proximity claim. Inclusive: exactly 100 m passes. */
export const MAX_ACCURACY_METERS = 100;

/** Older than this and the guest may have walked away since. Inclusive: exactly 60 s passes. */
export const MAX_READING_AGE_SECONDS = 60;

/**
 * Device clocks drift, and a reading can be stamped a moment ahead of the server.
 * A few seconds is ordinary skew; beyond it, the timestamp is not credible.
 */
export const MAX_CLOCK_SKEW_SECONDS = 5;

export type GpsEvidenceFailure =
  | "invalid_coordinates"
  | "invalid_accuracy"
  | "inaccurate"
  | "invalid_capture_time"
  | "stale"
  | "future_reading";

export type GpsEvidenceResult = { ok: true } | { ok: false; reason: GpsEvidenceFailure };

export type GpsEvidence = {
  latitude: number;
  longitude: number;
  /** Radius of uncertainty in metres, as the browser reports it (`coords.accuracy`). */
  accuracyMeters: number;
  /** When the device took the reading (`position.timestamp`), in epoch milliseconds. */
  capturedAtMs: number;
};

/**
 * Validates the whole reading. Missing or malformed values fail: absent evidence
 * is not weak evidence, it is none, and a check-in may not proceed on it.
 */
export function validateGpsEvidence(evidence: GpsEvidence, now: Date): GpsEvidenceResult {
  const { latitude, longitude, accuracyMeters, capturedAtMs } = evidence;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return { ok: false, reason: "invalid_coordinates" };
  }

  // A negative or non-finite radius is not a measurement. Zero is allowed: some
  // devices report it, and it claims more precision rather than less.
  if (!Number.isFinite(accuracyMeters) || accuracyMeters < 0) {
    return { ok: false, reason: "invalid_accuracy" };
  }
  if (accuracyMeters > MAX_ACCURACY_METERS) {
    return { ok: false, reason: "inaccurate" };
  }

  if (!Number.isFinite(capturedAtMs)) {
    return { ok: false, reason: "invalid_capture_time" };
  }

  const ageSeconds = (now.getTime() - capturedAtMs) / 1000;

  // Ahead of the server by more than ordinary clock skew.
  if (ageSeconds < -MAX_CLOCK_SKEW_SECONDS) {
    return { ok: false, reason: "future_reading" };
  }
  if (ageSeconds > MAX_READING_AGE_SECONDS) {
    return { ok: false, reason: "stale" };
  }

  return { ok: true };
}

/**
 * One message for every evidence failure.
 *
 * Deliberately about the READING rather than about the guest or the stop: it is
 * almost always a phone indoors or a cached fix, and naming which specific rule
 * failed would also tell someone probing the endpoint exactly which number to
 * forge next.
 */
export function gpsEvidenceMessage(): string {
  return "We couldn't get a reliable position fix. Step outside or wait a moment, then try again.";
}
