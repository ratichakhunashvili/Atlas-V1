import { distanceMeters } from "@/lib/geo";
import type { Achievement, CheckInMethod, ItineraryDay, ItineraryStop } from "@/db/schema";
import type { RecordVisitResult } from "@/db/operations/place-visits";
import { CHECK_IN_RADIUS_METERS, firstUnvisitedStop } from "./check-in";
import { isCheckInMethodAllowed, wrongCheckInMethodMessage } from "./check-in-method";
import { gpsEvidenceMessage, validateGpsEvidence } from "./gps-evidence";
import {
  evaluateDayCheckIn,
  evaluatePendingStops,
  isAvailable,
  loadDefaultAvailabilityContext,
  type AvailabilityContextLoader,
} from "./stop-availability";
import { compareHashes, hasSufficientDetail, isValidHash } from "@/services/ar/hash";

/**
 * AR check-in: a camera match AND the guest being there.
 *
 * The hash alone proves very little — it matches a framing of a subject, so a
 * photograph of a photograph would satisfy it. It is therefore never accepted on
 * its own: every AR check-in must also pass the same GPS evidence and the same
 * 150 m proximity as an ordinary GPS check-in, and the same ownership, stay, day,
 * order and eligibility rules as every other method.
 *
 * **The stored target hash never leaves the server.** It is read here, compared
 * here, and never returned in any result — a client that knew the target could
 * submit it directly and never point a camera at anything.
 *
 * **No image is handled at all.** The browser computes the hash from its own
 * camera frame and sends 60 hex characters. No photo is uploaded, stored or
 * logged, by this function or anywhere else.
 */

export type ArCheckInFailureReason =
  | "not_found"
  | "stop_not_next"
  | "stop_unavailable"
  | "wrong_day"
  | "wrong_check_in_method"
  | "unreliable_position"
  | "out_of_range"
  | "no_target"
  | "no_match"
  | "rate_limited";

export type ArCheckInResult =
  | {
      ok: true;
      stop: ItineraryStop;
      nextStop: ItineraryStop | null;
      dayCompleted: boolean;
      alreadyVisited: boolean;
      unlockedAchievement?: Achievement | null;
    }
  | {
      ok: false;
      reason: ArCheckInFailureReason;
      message: string;
      distanceMeters?: number;
      requiredRadiusMeters?: number;
    };

export type ArCheckInDependencies = {
  findItineraryStopWithDay: (stopId: string) => Promise<{ stop: ItineraryStop; day: ItineraryDay } | null>;
  listItineraryStops: (dayId: string) => Promise<ItineraryStop[]>;
  /** The Place's reference hash. Server-side only; never returned to a caller. */
  findArTargetHash: (placeId: string) => Promise<string | null>;
  markStopVisited: (stopId: string, dayId: string) => Promise<{ stop: ItineraryStop; dayCompleted: boolean } | null>;
  /** Turns an accepted check-in into permanent history. Called only AFTER the stop write has succeeded. */
  recordVerifiedVisit: (input: {
    userId: string;
    placeId: string;
    method: CheckInMethod;
    now: Date;
  }) => Promise<RecordVisitResult>;
  /** Re-evaluates eligibility server-side from the authenticated guest's own stay. */
  loadAvailabilityContext: AvailabilityContextLoader;
};

async function loadDefaultDependencies(): Promise<ArCheckInDependencies> {
  const [itineraryQ, visitsQ, arQ] = await Promise.all([
    import("@/db/queries/itinerary"),
    import("@/db/queries/place-visits"),
    import("@/db/queries/place-ar-targets"),
  ]);

  return {
    findItineraryStopWithDay: itineraryQ.findItineraryStopWithDay,
    listItineraryStops: itineraryQ.listItineraryStops,
    findArTargetHash: arQ.findArTargetHash,
    markStopVisited: itineraryQ.markStopVisited,
    recordVerifiedVisit: visitsQ.recordVerifiedVisit,
    loadAvailabilityContext: loadDefaultAvailabilityContext,
  };
}

export async function checkInStopWithAr(
  input: {
    userId: string;
    stopId: string;
    /** 60 hex characters computed by the guest's own browser from its camera frame. */
    captureHash: string;
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    capturedAtMs: number;
  },
  deps?: ArCheckInDependencies,
  now: Date = new Date()
): Promise<ArCheckInResult> {
  const d = deps ?? (await loadDefaultDependencies());

  const found = await d.findItineraryStopWithDay(input.stopId);
  // Same generic answer whether the stop does not exist or belongs to somebody else.
  if (!found || found.day.userId !== input.userId) {
    return { ok: false, reason: "not_found", message: "Stop not found." };
  }
  const { stop, day } = found;

  // Already done: idempotent success, no second write and no second unlock.
  if (stop.visitedAt !== null) {
    const stops = await d.listItineraryStops(day.id);
    return {
      ok: true,
      stop,
      nextStop: firstUnvisitedStop(stops),
      dayCompleted: stops.every((s) => s.visitedAt !== null),
      alreadyVisited: true,
    };
  }

  const stops = await d.listItineraryStops(day.id);
  const required = firstUnvisitedStop(stops);
  const context = await d.loadAvailabilityContext(input.userId, now);

  const dayCheck = evaluateDayCheckIn(day, context);
  if (!dayCheck.ok && dayCheck.reason === "not_current_day") {
    return { ok: false, reason: "wrong_day", message: "That stop belongs to a different day's route, so it can't be checked in now." };
  }

  const availability = evaluatePendingStops(stops, day, context);
  if (!isAvailable(availability.get(stop.id))) {
    return {
      ok: false,
      reason: "stop_unavailable",
      message: "This stop is no longer available through your hotel. Update your plan to continue.",
    };
  }

  if (!required || required.id !== stop.id) {
    return { ok: false, reason: "stop_not_next", message: "Check in your stops in order — this isn't your next stop yet." };
  }

  /*
   * The stop's SAVED method still governs. AR is not a universal key: a stop that
   * requires a QR scan is not completable by photographing it, and one that
   * requires GPS is not either.
   */
  if (!isCheckInMethodAllowed(stop.checkInMethod, "ar")) {
    return { ok: false, reason: "wrong_check_in_method", message: wrongCheckInMethodMessage(stop.checkInMethod) };
  }

  // The same position evidence as a GPS check-in — a camera match is never a
  // substitute for being there.
  const evidence = validateGpsEvidence(
    {
      latitude: input.latitude,
      longitude: input.longitude,
      accuracyMeters: input.accuracyMeters,
      capturedAtMs: input.capturedAtMs,
    },
    now
  );
  if (!evidence.ok) {
    return { ok: false, reason: "unreliable_position", message: gpsEvidenceMessage() };
  }

  const distance = distanceMeters(
    { lat: input.latitude, lng: input.longitude },
    { lat: stop.latitude, lng: stop.longitude }
  );
  if (distance > CHECK_IN_RADIUS_METERS) {
    return {
      ok: false,
      reason: "out_of_range",
      message: `You're about ${Math.round(distance)}m away — get within ${CHECK_IN_RADIUS_METERS}m to check in.`,
      distanceMeters: Math.round(distance),
      requiredRadiusMeters: CHECK_IN_RADIUS_METERS,
    };
  }

  // Malformed capture: refused before anything is compared, so a broken client
  // cannot stumble into a match.
  if (!isValidHash(input.captureHash)) {
    return { ok: false, reason: "no_match", message: "We couldn't read that photo. Try again, straight on." };
  }

  if (!stop.placeId) {
    return { ok: false, reason: "no_target", message: "This stop can't be verified by camera." };
  }

  const target = await d.findArTargetHash(stop.placeId);
  if (!target) {
    return { ok: false, reason: "no_target", message: "This stop can't be verified by camera." };
  }

  // Admin actions reject featureless references, but the server check-in also
  // defends against a malformed or legacy target inserted outside that path.
  const targetDetail = hasSufficientDetail(target);
  const comparison = targetDetail.ok ? compareHashes(input.captureHash, target) : null;
  if (!comparison?.ok) {
    /*
     * One message for "too different" and for a malformed target alike, and
     * deliberately no distance in the result: telling a client how close it got
     * would let it hill-climb towards a match without ever being there.
     */
    return {
      ok: false,
      reason: "no_match",
      message: "That doesn't look like this place yet. Frame the location more clearly and try again.",
    };
  }

  // Re-check availability as the very last step before the write, as every other
  // method does. The documented concurrent-revocation race is unchanged.
  const fresh = evaluatePendingStops(stops, day, await d.loadAvailabilityContext(input.userId, now));
  if (!isAvailable(fresh.get(stop.id))) {
    return {
      ok: false,
      reason: "stop_unavailable",
      message: "This stop is no longer available through your hotel. Update your plan to continue.",
    };
  }

  const updated = await d.markStopVisited(stop.id, day.id);
  if (!updated) {
    // Lost a race with another request for this stop; report it idempotently.
    const freshStops = await d.listItineraryStops(day.id);
    const freshStop = freshStops.find((s) => s.id === stop.id) ?? stop;
    return {
      ok: true,
      stop: freshStop,
      nextStop: firstUnvisitedStop(freshStops),
      dayCompleted: freshStops.every((s) => s.visitedAt !== null),
      alreadyVisited: true,
    };
  }

  const visitOutcome = await d.recordVerifiedVisit({
    userId: input.userId,
    placeId: stop.placeId,
    method: "ar",
    now,
  });

  const freshStops = await d.listItineraryStops(day.id);
  return {
    ok: true,
    stop: updated.stop,
    nextStop: firstUnvisitedStop(freshStops),
    dayCompleted: updated.dayCompleted,
    alreadyVisited: false,
    unlockedAchievement: visitOutcome.unlockedAchievement,
  };
}
