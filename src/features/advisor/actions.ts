"use server";

import { requireUser } from "@/lib/authorization";
import { checkInStopWithGps, type CheckInResult } from "@/services/advisor/check-in";
import { checkInStopWithQr, type QrCheckInResult } from "@/services/advisor/check-in-qr";
import { generateItineraryForUser, type GenerateItineraryResult } from "@/services/advisor/generate-itinerary";
import { getWalkingDirections, type DirectionsRoute, type RoutingFailureReason } from "@/services/routing";
import { findItineraryStopWithDay } from "@/db/queries/itinerary";
import { checkInGpsSchema, checkInQrSchema, directionsToStopSchema } from "./schema";

/**
 * Thin authentication/input boundary: `requireUser()` resolves the
 * authenticated user server-side (a client can never supply its own
 * userId), zod re-validates the coordinates a client-side `-0`/string/odd
 * value could otherwise smuggle through, then the real business rules
 * (ownership, first-unvisited-stop, 150m radius) live entirely in
 * checkInStopWithGps. Called directly from a client component with plain
 * arguments (position.coords.latitude/longitude), matching Map Advisor
 * Functional's AttractionCheckInButton call shape — no FormData needed.
 */
export async function checkInGpsAction(stopId: string, latitude: number, longitude: number): Promise<CheckInResult> {
  const user = await requireUser();

  const parsed = checkInGpsSchema.safeParse({ stopId, latitude, longitude });
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid_coordinates",
      message: parsed.error.issues[0]?.message ?? "Invalid check-in request.",
    };
  }

  return checkInStopWithGps({
    userId: user.id,
    stopId: parsed.data.stopId,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
  });
}

/**
 * Same shape as checkInGpsAction: requireUser() resolves the authenticated
 * user, zod validates the scanned/typed input is a non-empty string, then
 * every real decision (token -> Place resolution, itinerary ownership,
 * first-unvisited-stop, Place matching) lives in checkInStopWithQr. The
 * scanner component never decides validity — it only extracts text and
 * forwards it here.
 */
export async function checkInQrAction(qrToken: string): Promise<QrCheckInResult> {
  const user = await requireUser();

  const parsed = checkInQrSchema.safeParse({ qrToken });
  if (!parsed.success) {
    return {
      ok: false,
      reason: "invalid_qr",
      message: parsed.error.issues[0]?.message ?? "Invalid QR code.",
    };
  }

  return checkInStopWithQr({ userId: user.id, qrToken: parsed.data.qrToken });
}

/**
 * The only action that creates or regenerates an itinerary from the guest
 * UI — it calls generateItineraryForUser directly, no business logic here.
 * The service itself decides whether to actually regenerate (cooldown,
 * admin exemption, etc.); the UI only decides WHEN to call it (an explicit
 * button press, never automatically).
 */
export async function generateItineraryAction(): Promise<GenerateItineraryResult> {
  const user = await requireUser();
  return generateItineraryForUser(user.id);
}

export type DirectionsToStopResult =
  | { ok: true; route: DirectionsRoute }
  | { ok: false; reason: RoutingFailureReason | "not_found"; message: string };

/**
 * One Directions-API leg (current location -> one stop), never the full
 * Optimization call generation uses — this is "show me the way to my
 * current stop," not itinerary (re)generation. The destination is always
 * resolved server-side from the stop's own persisted coordinates via
 * findItineraryStopWithDay, which also enforces ownership — a client can
 * supply its own current coordinates (the only thing it actually knows),
 * never the destination.
 */
export async function getDirectionsToStopAction(
  stopId: string,
  latitude: number,
  longitude: number
): Promise<DirectionsToStopResult> {
  const user = await requireUser();

  const parsed = directionsToStopSchema.safeParse({ stopId, latitude, longitude });
  if (!parsed.success) {
    return { reason: "not_found" as const, ok: false, message: parsed.error.issues[0]?.message ?? "Invalid request." };
  }

  const found = await findItineraryStopWithDay(parsed.data.stopId);
  if (!found || found.day.userId !== user.id) {
    return { ok: false, reason: "not_found", message: "Stop not found." };
  }

  return getWalkingDirections({
    origin: { lat: parsed.data.latitude, lng: parsed.data.longitude },
    destination: { lat: found.stop.latitude, lng: found.stop.longitude },
  });
}
