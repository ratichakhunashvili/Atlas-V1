import { z } from "zod";

export const checkInGpsSchema = z.object({
  stopId: z.string().uuid(),
  // .finite() rejects NaN and ±Infinity explicitly, not just non-numbers —
  // the service layer re-validates the range independently regardless (see
  // services/advisor/gps-evidence.ts), but input this malformed should never
  // even reach it.
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  /*
   * Required, not optional. A check-in that reports no accuracy and no capture
   * time has supplied no evidence at all, and "no evidence" must fail the same
   * way bad evidence does — an optional field with a forgiving default is how a
   * client ends up able to skip the rule by omitting it.
   *
   * The thresholds themselves live in the service, applied against the server's
   * own clock; this boundary only rejects values that are not numbers at all.
   */
  accuracyMeters: z.number().finite().min(0),
  capturedAtMs: z.number().finite().int(),
});

/**
 * An AR check-in: the same GPS evidence as above, plus the hash the guest's own
 * browser computed from its camera frame.
 *
 * `captureHash` is 60 lowercase hex characters and nothing else. **No image is
 * accepted by this boundary** — there is no field here that could carry one, so
 * a photo cannot be uploaded even by a client that tried to send one.
 *
 * The GPS fields are required for exactly the reason they are required for a
 * plain GPS check-in: a hash match says the camera is pointed at the right
 * subject, not that the guest is standing in front of it.
 */
export const checkInArSchema = z.object({
  stopId: z.string().uuid(),
  // The shape is also checked in the service (isValidHash) and by a database
  // CHECK on the stored target. Rejecting it here keeps obviously malformed
  // input from reaching the comparison at all.
  captureHash: z
    .string()
    .regex(/^[0-9a-f]{60}$/, "Capture could not be read"),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  accuracyMeters: z.number().finite().min(0),
  capturedAtMs: z.number().finite().int(),
});

export const checkInQrSchema = z.object({
  // Opaque only — the scanner/manual-entry path is free-text (a scanned
  // QR payload or a raw token), never a client-supplied placeId/stopId.
  qrToken: z.string().trim().min(1, "Scan or enter a QR code"),
});

export const directionsToStopSchema = z.object({
  stopId: z.string().uuid(),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

/**
 * The free time a guest says they have. A literal union, not a number range: the
 * Advisor offers four windows and plans for exactly those, so an arbitrary value
 * from a client (or a tampered one) is refused rather than honoured.
 */
export const availableMinutesSchema = z.object({
  availableMinutes: z.union([z.literal(60), z.literal(120), z.literal(180), z.literal(240)]),
});

export const removeStopSchema = z.object({
  stopId: z.string().uuid(),
});
