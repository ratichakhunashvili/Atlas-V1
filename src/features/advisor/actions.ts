"use server";

import { requireUser } from "@/lib/authorization";
import { checkInStopWithGps, type CheckInResult } from "@/services/advisor/check-in";
import { checkInStopWithQr, type QrCheckInResult } from "@/services/advisor/check-in-qr";
import { checkInStopWithAr, type ArCheckInResult } from "@/services/advisor/check-in-ar";
import { generateItineraryForUser, type GenerateItineraryResult } from "@/services/advisor/generate-itinerary";
import { getDirectionsToStopForUser, type DirectionsToStopResult } from "@/services/advisor/directions-to-stop";
import { retryRouteGeometryForUser, type RetryRouteGeometryResult } from "@/services/advisor/retry-route-geometry";
import {
  removeUnavailableStopForUser,
  replaceUnavailableStopsForUser,
  type RemoveUnavailableStopResult,
  type ReplaceUnavailableStopsResult,
} from "@/services/advisor/plan-repair";
import { checkAttemptAllowed, recordFailedAttempt, reserveAttempt } from "@/db/queries/rate-limit";
import { rateLimitedMessage } from "@/services/rate-limit/policy";
import { gpsEvidenceMessage } from "@/services/advisor/gps-evidence";
import { availableMinutesSchema, checkInArSchema, checkInGpsSchema, checkInQrSchema, directionsToStopSchema, removeStopSchema } from "./schema";

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
export async function checkInGpsAction(
  stopId: string,
  latitude: number,
  longitude: number,
  accuracyMeters: number,
  capturedAtMs: number
): Promise<CheckInResult> {
  const user = await requireUser();

  const parsed = checkInGpsSchema.safeParse({ stopId, latitude, longitude, accuracyMeters, capturedAtMs });
  if (!parsed.success) {
    // One shape of refusal for any malformed reading: which field was wrong is not
    // the guest's problem, and naming it tells a prober what to send next.
    return { ok: false, reason: "unreliable_position", message: gpsEvidenceMessage() };
  }

  // Throttle BEFORE doing the work. Shared bucket with QR check-in: both are
  // attempts to complete a stop. Only failures count, so a guest completing stop
  // after stop is never throttled for using the product properly.
  const allowed = await checkAttemptAllowed({ scope: "place_check_in", actorId: user.id, now: new Date() });
  if (!allowed.allowed) {
    return { ok: false, reason: "rate_limited", message: rateLimitedMessage() };
  }

  const result = await checkInStopWithGps({
    userId: user.id,
    stopId: parsed.data.stopId,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    accuracyMeters: parsed.data.accuracyMeters,
    capturedAtMs: parsed.data.capturedAtMs,
  });

  if (!result.ok) {
    await recordFailedAttempt({ scope: "place_check_in", actorId: user.id, now: new Date() });
  }

  return result;
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

  // Same bucket as GPS check-in: one allowance for completing a stop, however it is attempted.
  const allowed = await checkAttemptAllowed({ scope: "place_check_in", actorId: user.id, now: new Date() });
  if (!allowed.allowed) {
    return { ok: false, reason: "rate_limited", message: rateLimitedMessage() };
  }

  const result = await checkInStopWithQr({ userId: user.id, qrToken: parsed.data.qrToken });

  if (!result.ok) {
    await recordFailedAttempt({ scope: "place_check_in", actorId: user.id, now: new Date() });
  }

  return result;
}

/**
 * AR check-in. Identical boundary discipline to the two above: `requireUser()`
 * decides who is acting, zod decides whether the input is even the right shape,
 * and every rule that matters — ownership, active stay, current day, stop order,
 * eligibility, the stop's saved method, proximity, the hash comparison and
 * idempotency — lives in `checkInStopWithAr`.
 *
 * **Nothing resembling an image crosses this boundary**, and the stored target
 * hash never crosses it in the other direction: the result type has no field for
 * it, and refusals are deliberately uniform so a caller cannot learn how close a
 * capture came and climb towards a match from a hotel room.
 */
export async function checkInArAction(
  stopId: string,
  captureHash: string,
  latitude: number,
  longitude: number,
  accuracyMeters: number,
  capturedAtMs: number
): Promise<ArCheckInResult> {
  const user = await requireUser();

  const parsed = checkInArSchema.safeParse({ stopId, captureHash, latitude, longitude, accuracyMeters, capturedAtMs });
  if (!parsed.success) {
    /*
     * One refusal for a malformed reading and a malformed hash alike. Telling a
     * caller which half it got wrong is a free oracle: it would separate "your
     * position was rejected" from "your photo was rejected" without either
     * being true.
     */
    return { ok: false, reason: "unreliable_position", message: gpsEvidenceMessage() };
  }

  // Same bucket as GPS and QR: one allowance for completing a stop, however it
  // is attempted. Counted before the work, and only failures count.
  const allowed = await checkAttemptAllowed({ scope: "place_check_in", actorId: user.id, now: new Date() });
  if (!allowed.allowed) {
    return { ok: false, reason: "rate_limited", message: rateLimitedMessage() };
  }

  const result = await checkInStopWithAr({
    userId: user.id,
    stopId: parsed.data.stopId,
    captureHash: parsed.data.captureHash,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    accuracyMeters: parsed.data.accuracyMeters,
    capturedAtMs: parsed.data.capturedAtMs,
  });

  if (!result.ok) {
    await recordFailedAttempt({ scope: "place_check_in", actorId: user.id, now: new Date() });
  }

  return result;
}

/**
 * The only action that creates or regenerates an itinerary from the guest
 * UI — it calls generateItineraryForUser directly, no business logic here.
 * The service itself decides whether to actually regenerate (cooldown,
 * admin exemption, etc.); the UI only decides WHEN to call it (an explicit
 * button press, never automatically).
 */
export async function generateItineraryAction(availableMinutes?: number): Promise<GenerateItineraryResult> {
  const user = await requireUser();

  // The window is the guest's own choice, but it is still client input: anything
  // outside the offered options is rejected here rather than planned for.
  const parsed = availableMinutesSchema.safeParse({ availableMinutes });
  if (!parsed.success) {
    return {
      ok: false,
      reason: "no_plan_fits_time",
      message: "Choose how much free time you have before generating a plan.",
    };
  }

  return generateItineraryForUser(user.id, new Date(), undefined, {
    availableMinutes: parsed.data.availableMinutes,
  });
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

/**
 * "Try again" after the saved route line could not be drawn. Takes NO arguments: the day is the authenticated guest's
 * own, resolved on the server, and only the line is rewritten — never the stops or their order.
 */
export async function retryRouteGeometryAction(): Promise<RetryRouteGeometryResult> {
  const user = await requireUser();
  // Every attempt can cost a Mapbox request, so each one is counted (reserved before the work).
  const reserved = await reserveAttempt({ scope: "route_retry", actorId: user.id, now: new Date() });
  if (!reserved.allowed) return { ok: false, reason: "no_route", message: rateLimitedMessage() };
  return retryRouteGeometryForUser(user.id);
}
