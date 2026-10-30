import { distanceMeters, type LatLng } from "@/lib/geo";
import type { Achievement, CheckInMethod, ItineraryDay, ItineraryStop } from "@/db/schema";
import type { RecordVisitResult } from "@/db/operations/place-visits";
import { isCheckInMethodAllowed, wrongCheckInMethodMessage } from "./check-in-method";
import { gpsEvidenceMessage, validateGpsEvidence } from "./gps-evidence";
import { evaluateDayCheckIn, evaluatePendingStops, isAvailable, loadDefaultAvailabilityContext, type AvailabilityContextLoader } from "./stop-availability";

/** Exact radius as Map Advisor Functional's CHECKIN_RADIUS_METERS — never increase this, never make it client-configurable. */
export const CHECK_IN_RADIUS_METERS = 150;

export type CheckInFailureReason =
  | "not_found"
  | "invalid_coordinates"
  | "stop_not_next"
  | "stop_unavailable"
  | "wrong_day"
  | "wrong_check_in_method"
  /** The reading was missing, malformed, too imprecise, stale, or stamped in the future. */
  | "unreliable_position"
  /** Too many failed attempts in the window. Never says which attempt failed or why. */
  | "rate_limited"
  | "out_of_range";

export type CheckInResult =
  | {
      ok: true;
      stop: ItineraryStop;
      nextStop: ItineraryStop | null;
      dayCompleted: boolean;
      /** True when the stop was already visited before this call — no DB write happened, reported idempotently rather than as an error. */
      alreadyVisited: boolean;
      /** Set only on the arrival that EARNED a badge, so the celebration cannot repeat. Null otherwise. */
      unlockedAchievement?: Achievement | null;
    }
  | {
      ok: false;
      reason: CheckInFailureReason;
      message: string;
      distanceMeters?: number;
      requiredRadiusMeters?: number;
      nextStop?: { id: string; name: string };
      /** Set when an earlier pending stop that is no longer available is blocking this one (stop order is kept). */
      blockedByUnavailableStop?: { id: string; name: string };
    };

export type CheckInDependencies = {
  findItineraryStopWithDay: (stopId: string) => Promise<{ stop: ItineraryStop; day: ItineraryDay } | null>;
  listItineraryStops: (dayId: string) => Promise<ItineraryStop[]>;
  /** Records the visit only. The stop's saved checkInMethod is the requirement and is never rewritten by a check-in. */
  markStopVisited: (stopId: string, dayId: string) => Promise<{ stop: ItineraryStop; dayCompleted: boolean } | null>;
  /** Turns an accepted check-in into permanent history. Called only AFTER the stop write has succeeded. */
  recordVerifiedVisit: (input: {
    userId: string;
    placeId: string;
    method: CheckInMethod;
    now: Date;
  }) => Promise<RecordVisitResult>;
  /** Re-evaluates eligibility server-side from the authenticated guest's own stay. Called twice per check-in: early (to decide) and again immediately before the write. */
  loadAvailabilityContext: AvailabilityContextLoader;
};

// Type-only import, lazily resolved below — same reason as every other
// services/* boundary in Atlas that needs its real deps to stay out of a
// plain `node --test` run: db/queries/itinerary.ts starts with
// `import "server-only"`, which throws unconditionally outside Next's own
// bundler. See services/routing/index.ts's resolveAccessToken and
// services/advisor/generate-itinerary.ts's loadDefaultDependencies for the
// same pattern.
async function loadDefaultDependencies(): Promise<CheckInDependencies> {
  const [itineraryQ, visitsQ] = await Promise.all([
    import("@/db/queries/itinerary"),
    import("@/db/queries/place-visits"),
  ]);
  return {
    findItineraryStopWithDay: itineraryQ.findItineraryStopWithDay,
    listItineraryStops: itineraryQ.listItineraryStops,
    markStopVisited: itineraryQ.markStopVisited,
    recordVerifiedVisit: visitsQ.recordVerifiedVisit,
    loadAvailabilityContext: loadDefaultAvailabilityContext,
  };
}

export function isValidCoordinate(coords: LatLng): boolean {
  return (
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    coords.lat >= -90 &&
    coords.lat <= 90 &&
    coords.lng >= -180 &&
    coords.lng <= 180
  );
}

/** The first stop (by position) not yet visited — the only stop check-in (GPS or QR) may accept. Never trusts a client-provided "next stop" value. Exported so QR check-in (services/advisor/check-in-qr.ts) shares the exact same rule instead of a second implementation. */
export function firstUnvisitedStop(stops: readonly ItineraryStop[]): ItineraryStop | null {
  return [...stops].sort((a, b) => a.position - b.position).find((stop) => stop.visitedAt === null) ?? null;
}

/**
 * Server-authoritative GPS check-in: resolves ownership from `stopId` alone
 * (never trusts a client-supplied userId/hotelId/dayId), enforces that only
 * the first unvisited stop may be checked in, validates coordinates, and
 * verifies the submitted position is within CHECK_IN_RADIUS_METERS of the
 * stop's canonical Place coordinates before ever touching the DB. The
 * browser supplies coordinates only — every decision happens here.
 */
export async function checkInStopWithGps(
  input: {
    userId: string;
    stopId: string;
    latitude: number;
    longitude: number;
    /** The browser's own accuracy radius in metres. Self-declared — see gps-evidence.ts. */
    accuracyMeters: number;
    /** When the device took the reading, epoch milliseconds. */
    capturedAtMs: number;
  },
  deps?: CheckInDependencies,
  now: Date = new Date()
): Promise<CheckInResult> {
  const d = deps ?? (await loadDefaultDependencies());

  const found = await d.findItineraryStopWithDay(input.stopId);
  // Same generic message whether the stop doesn't exist or belongs to someone
  // else — never reveal which, and never let hotelId/dayId/placeId from the
  // client stand in for an ownership check.
  if (!found || found.day.userId !== input.userId) {
    return { ok: false, reason: "not_found", message: "Stop not found." };
  }
  const { stop, day } = found;

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

  // Eligibility is re-checked server-side from the guest's own stay. A client can never supply the
  // hotel, place, or availability: only the stopId above, which resolves to a stop the guest owns.
  const context = await d.loadAvailabilityContext(input.userId, now);

  // Which day may be checked in: ONLY the guest's current day of their own current stay. The current day is
  // computed on the server from the stay dates and the server clock (never from a client-supplied date), so a
  // pending stop from an EARLIER day — even of the same stay — or a future day is refused with no write.
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
      nextStop: required ? { id: required.id, name: required.name } : undefined,
    };
  }

  if (!required || required.id !== stop.id) {
    // Stop order is kept: an unavailable stop blocks itself AND every later stop, while earlier available
    // stops (which are always the first unvisited ones) remain checkable.
    const blocker = required && !isAvailable(availability.get(required.id)) ? { id: required.id, name: required.name } : undefined;
    return {
      ok: false,
      reason: "stop_not_next",
      message: blocker
        ? "An earlier stop is no longer available, so later stops are on hold. Update your plan to continue."
        : "Check in your stops in order — this isn't your next stop yet.",
      nextStop: required ? { id: required.id, name: required.name } : undefined,
      blockedByUnavailableStop: blocker,
    };
  }

  // The stop's SAVED method decides how it may be completed — a client cannot downgrade a partner's
  // QR requirement to "I am nearby" by calling this action instead of the QR one.
  if (!isCheckInMethodAllowed(stop.checkInMethod, "gps")) {
    return { ok: false, reason: "wrong_check_in_method", message: wrongCheckInMethodMessage(stop.checkInMethod) };
  }

  // The reading itself: coordinates in range, a usable accuracy radius, and a fix
  // taken recently enough to still describe where the guest is. One shared message
  // for every cause — naming the failing rule would tell a prober which number to
  // forge next (services/advisor/gps-evidence.ts).
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
    return {
      ok: false,
      reason: evidence.reason === "invalid_coordinates" ? "invalid_coordinates" : "unreliable_position",
      message: evidence.reason === "invalid_coordinates" ? "Invalid GPS coordinates." : gpsEvidenceMessage(),
    };
  }

  const distance = distanceMeters({ lat: input.latitude, lng: input.longitude }, { lat: stop.latitude, lng: stop.longitude });
  if (distance > CHECK_IN_RADIUS_METERS) {
    return {
      ok: false,
      reason: "out_of_range",
      message: `You're about ${Math.round(distance)}m away — get within ${CHECK_IN_RADIUS_METERS}m to check in.`,
      distanceMeters: Math.round(distance),
      requiredRadiusMeters: CHECK_IN_RADIUS_METERS,
    };
  }

  // Re-check eligibility FRESH as the very last step before the write. A revocation that lands between this
  // check and the UPDATE below is a small, accepted race (see docs/phase-acceptance-criteria.md): the two are
  // separate statements, and making them atomic would need locking across partnership rows.
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
    // Lost a concurrent race — another simultaneous request for this exact
    // stop already committed the visit. Report it the same idempotent way,
    // not as an error.
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


  /*
   * The check-in is now a fact: the stop row has been written, which means every
   * ownership, stay, day, order, method, evidence and eligibility rule passed.
   * Only here does it become permanent history — so a refused check-in cannot
   * create a visit or a badge, by construction rather than by a flag.
   *
   * A stop whose Place has since been deleted has nothing to record against; the
   * stop snapshot keeps the plan readable, but there is no canonical Place to say
   * the guest has been to.
   */
  const visitOutcome = stop.placeId
    ? await d.recordVerifiedVisit({ userId: input.userId, placeId: stop.placeId, method: "gps", now })
    : null;

  const freshStops = await d.listItineraryStops(day.id);
  return {
    ok: true,
    stop: updated.stop,
    nextStop: firstUnvisitedStop(freshStops),
    dayCompleted: updated.dayCompleted,
    alreadyVisited: false,
    unlockedAchievement: visitOutcome?.unlockedAchievement ?? null,
  };
}
