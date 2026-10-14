import { z } from "zod";

export const checkInGpsSchema = z.object({
  stopId: z.string().uuid(),
  // .finite() rejects NaN and ±Infinity explicitly, not just non-numbers —
  // the service layer re-validates the range independently regardless (see
  // services/advisor/check-in.ts's isValidCoordinate), but input this
  // malformed should never even reach it.
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
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

export const removeStopSchema = z.object({
  stopId: z.string().uuid(),
});
