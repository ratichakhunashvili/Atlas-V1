"use server";

import { requireUser } from "@/lib/authorization";
import { checkInStopWithGps, type CheckInResult } from "@/services/advisor/check-in";
import { checkInStopWithQr, type QrCheckInResult } from "@/services/advisor/check-in-qr";
import { generateItineraryForUser, type GenerateItineraryResult } from "@/services/advisor/generate-itinerary";
import { getDirectionsToStopForUser, type DirectionsToStopResult } from "@/services/advisor/directions-to-stop";
import {
  removeUnavailableStopForUser,
  replaceUnavailableStopsForUser,
  type RemoveUnavailableStopResult,
  type ReplaceUnavailableStopsResult,
} from "@/services/advisor/plan-repair";
import { checkInGpsSchema, checkInQrSchema, directionsToStopSchema, removeStopSchema } from "./schema";

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

export type { DirectionsToStopResult };

/**
 * One Directions-API leg (current location -> one stop). The destination is always resolved server-side
 * from the stop's own persisted coordinates, ownership is enforced from the stop's day, and a pending stop
 * that is no longer available is refused (see services/advisor/directions-to-stop.ts). A client supplies
 * only its own current coordinates — never the destination or any hotel/place id.
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

  return getDirectionsToStopForUser({
    userId: user.id,
    stopId: parsed.data.stopId,
    origin: { lat: parsed.data.latitude, lng: parsed.data.longitude },
  });
}

/**
 * The ONLY entry point for replacing unavailable pending stops. It takes no arguments at all: which stops
 * are unavailable is decided on the server from the authenticated guest's own stay, never from the client.
 * Separate from generateItineraryAction, which keeps its normal cooldown behaviour and never changes an
 * existing day on its own.
 */
export async function replaceUnavailableStopsAction(): Promise<ReplaceUnavailableStopsResult> {
  const user = await requireUser();
  return replaceUnavailableStopsForUser(user.id);
}

/** Explicitly removes ONE unavailable pending stop (when no replacement exists). Its snapshot is kept as history. */
export async function removeUnavailableStopAction(stopId: string): Promise<RemoveUnavailableStopResult> {
  const user = await requireUser();

  const parsed = removeStopSchema.safeParse({ stopId });
  if (!parsed.success) {
    return { ok: false, reason: "not_found", message: "Stop not found." };
  }

  return removeUnavailableStopForUser({ userId: user.id, stopId: parsed.data.stopId });
}
