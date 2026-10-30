import type { Achievement, CheckInMethod, Hotel, ItineraryDay, ItineraryStop, Place } from "@/db/schema";
import type { RecordVisitResult } from "@/db/operations/place-visits";
import { calculateDayNumber, stayEndFor } from "./stay-day";
import { firstUnvisitedStop } from "./check-in";
import { isCheckInMethodAllowed, wrongCheckInMethodMessage } from "./check-in-method";
import { evaluateDayCheckIn, evaluatePendingStops, isAvailable, loadDefaultAvailabilityContext, type AvailabilityContextLoader } from "./stop-availability";

export type QrCheckInFailureReason =
  | "invalid_qr"
  | "no_active_itinerary"
  | "place_not_next"
  | "stop_unavailable"
  | "wrong_day"
  | "wrong_check_in_method"
  /** Too many failed attempts in the window. Deliberately indistinguishable from any other refusal. */
  | "rate_limited";

export type QrCheckInResult =
  | {
      ok: true;
      stop: ItineraryStop;
      nextStop: ItineraryStop | null;
      dayCompleted: boolean;
      /** True when the stop was already visited before this scan — no DB write happened, reported idempotently rather than as an error. */
      alreadyVisited: boolean;
      /** Set only on the arrival that EARNED a badge, so the celebration cannot repeat. Null otherwise. */
      unlockedAchievement?: Achievement | null;
    }
  | {
      ok: false;
      reason: QrCheckInFailureReason;
      message: string;
      nextStop?: { id: string; name: string };
      /** Set when an earlier pending stop that is no longer available is blocking this one (stop order is kept). */
      blockedByUnavailableStop?: { id: string; name: string };
    };

type ActiveHotelStay = {
  id: string;
  checkIn: Date;
  checkOut: Date | null;
  hotel: Hotel;
  place: Place;
};

export type QrCheckInDependencies = {
  /**
   * Scanned text -> the Place that credential was issued for, or null. Resolution
   * happens entirely server-side through services/qr: the token is hashed, looked
   * up, and checked for purpose, revocation and expiry. A hotel-entry credential
   * never resolves here, and a Place id supplied by the client is not proof of a scan.
   */
  findPlaceByCheckInCredential: (scanned: string, now: Date) => Promise<Place | null>;
  findActiveStayForUser: (userId: string) => Promise<ActiveHotelStay | null>;
  findItineraryDay: (userId: string, hotelId: string, dayNumber: number) => Promise<ItineraryDay | null>;
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
  /** Re-evaluates eligibility server-side from the authenticated guest's own stay. Called early (to decide) and again immediately before the write. */
  loadAvailabilityContext: AvailabilityContextLoader;
};

// Type-only imports only here — same lazy-load pattern as every other
// services/* boundary in Atlas (see check-in.ts / generate-itinerary.ts for
// the full rationale): db/queries/* modules start with `import "server-only"`.
async function loadDefaultDependencies(): Promise<QrCheckInDependencies> {
  const [placesQ, hotelStaysQ, itineraryQ, credentialsQ, visitsQ, qrService] = await Promise.all([
    import("@/db/queries/places"),
    import("@/db/queries/hotel-stays"),
    import("@/db/queries/itinerary"),
    import("@/db/queries/qr-credentials"),
    import("@/db/queries/place-visits"),
    import("@/services/qr"),
  ]);
  return {
    findPlaceByCheckInCredential: async (scanned, now) => {
      const resolution = await qrService.resolveScannedQrToken(
        scanned,
        "place_check_in",
        credentialsQ.findQrCredentialByHash,
        now
      );
      if (!resolution.ok || !resolution.credential.placeId) return null;
      return placesQ.findPlaceById(resolution.credential.placeId);
    },
    findActiveStayForUser: hotelStaysQ.findActiveStayForUser,
    findItineraryDay: itineraryQ.findItineraryDay,
    listItineraryStops: itineraryQ.listItineraryStops,
    markStopVisited: itineraryQ.markStopVisited,
    recordVerifiedVisit: visitsQ.recordVerifiedVisit,
    loadAvailabilityContext: loadDefaultAvailabilityContext,
  };
}

/**
 * Server-authoritative QR check-in. Unlike GPS check-in, the client supplies
 * no stopId — only an opaque token. The server resolves token -> Place,
 * resolves the authenticated user's own active stay -> today's itinerary day
 * (never a client-supplied hotelId/dayId), and only completes the stop whose
 * placeId matches the scanned Place AND is that day's first unvisited stop.
 * A valid QR proves "this is Place A"; it does not by itself prove the user
 * is allowed to complete Place A right now — both must hold.
 */
export async function checkInStopWithQr(
  input: { userId: string; qrToken: string },
  now: Date = new Date(),
  deps?: QrCheckInDependencies
): Promise<QrCheckInResult> {
  const d = deps ?? (await loadDefaultDependencies());

  const trimmedToken = input.qrToken.trim();
  if (!trimmedToken) {
    return { ok: false, reason: "invalid_qr", message: "Invalid QR code." };
  }

  const place = await d.findPlaceByCheckInCredential(trimmedToken, now);
  if (!place) {
    return { ok: false, reason: "invalid_qr", message: "Invalid QR code." };
  }

  const stay = await d.findActiveStayForUser(input.userId);
  if (!stay) {
    return { ok: false, reason: "no_active_itinerary", message: "You don't have an active itinerary to check in against." };
  }

  const dayNumberResult = calculateDayNumber(stay.checkIn, stayEndFor(stay), now);
  if (!dayNumberResult.ok) {
    return { ok: false, reason: "no_active_itinerary", message: "You don't have an active itinerary to check in against." };
  }

  const day = await d.findItineraryDay(input.userId, stay.hotel.id, dayNumberResult.dayNumber);
  if (!day) {
    return { ok: false, reason: "no_active_itinerary", message: "You don't have an active itinerary to check in against." };
  }

  const stops = await d.listItineraryStops(day.id);
  // The scanned Place must correspond to a stop in THIS user's own itinerary
  // — never another user's, and never resolved from a client-supplied
  // placeId/stopId. A coincidental match in someone else's itinerary is
  // irrelevant: ownership is entirely a function of `input.userId` here.
  const matchingStop = stops.find((stop) => stop.placeId === place.id);
  if (!matchingStop) {
    return { ok: false, reason: "place_not_next", message: "This place isn't part of your current itinerary." };
  }

  if (matchingStop.visitedAt !== null) {
    return {
      ok: true,
      stop: matchingStop,
      nextStop: firstUnvisitedStop(stops),
      dayCompleted: stops.every((stop) => stop.visitedAt !== null),
      alreadyVisited: true,
    };
  }

  // The stop's SAVED method decides how it may be completed. A GPS-verified stop is not
  // completable by presenting a code, just as a QR stop is not completable by standing nearby.
  if (!isCheckInMethodAllowed(matchingStop.checkInMethod, "qr")) {
    return {
      ok: false,
      reason: "wrong_check_in_method",
      message: wrongCheckInMethodMessage(matchingStop.checkInMethod),
    };
  }

  const required = firstUnvisitedStop(stops);

  // Eligibility is re-checked server-side from the guest's own stay — a scanned code proves "this is Place A",
  // never "Place A is still available to this guest".
  const context = await d.loadAvailabilityContext(input.userId, now);

  // Which day may be checked in: ONLY the guest's current day of their own current stay, computed on the server.
  // The day above was looked up from the server-computed current day number, and this re-verifies it (defence in
  // depth) so an earlier or future day's stop can never be written, whatever a dependency returns.
  const dayCheck = evaluateDayCheckIn(day, context);
  if (!dayCheck.ok && dayCheck.reason === "not_current_day") {
    return { ok: false, reason: "wrong_day", message: "That stop belongs to a different day's route, so it can't be checked in now." };
  }

  const availability = evaluatePendingStops(stops, day, context);
  if (!isAvailable(availability.get(matchingStop.id))) {
    return {
      ok: false,
      reason: "stop_unavailable",
      message: "This stop is no longer available through your hotel. Update your plan to continue.",
      nextStop: required ? { id: required.id, name: required.name } : undefined,
    };
  }

  if (!required || required.id !== matchingStop.id) {
    // A valid QR for a real Place in the itinerary, but not the one the
    // guest is allowed to complete yet — order still governs. An unavailable earlier stop blocks later ones.
    const blocker = required && !isAvailable(availability.get(required.id)) ? { id: required.id, name: required.name } : undefined;
    return {
      ok: false,
      reason: "place_not_next",
      message: blocker
        ? "An earlier stop is no longer available, so later stops are on hold. Update your plan to continue."
        : "Check in your stops in order — this isn't your next stop yet.",
      nextStop: required ? { id: required.id, name: required.name } : undefined,
      blockedByUnavailableStop: blocker,
    };
  }

  // Re-check eligibility FRESH as the very last step before the write. A revocation landing between this check
  // and the UPDATE is a small, accepted race (see docs/phase-acceptance-criteria.md).
  const fresh = evaluatePendingStops(stops, day, await d.loadAvailabilityContext(input.userId, now));
  if (!isAvailable(fresh.get(matchingStop.id))) {
    return {
      ok: false,
      reason: "stop_unavailable",
      message: "This stop is no longer available through your hotel. Update your plan to continue.",
    };
  }

  const updated = await d.markStopVisited(matchingStop.id, day.id);
  if (!updated) {
    // Lost a concurrent race — another simultaneous scan already committed the visit.
    const freshStops = await d.listItineraryStops(day.id);
    const freshStop = freshStops.find((stop) => stop.id === matchingStop.id) ?? matchingStop;
    return {
      ok: true,
      stop: freshStop,
      nextStop: firstUnvisitedStop(freshStops),
      dayCompleted: freshStops.every((stop) => stop.visitedAt !== null),
      alreadyVisited: true,
    };
  }

  /*
   * The check-in is now a fact: the stop row has been written, which means every
   * ownership, stay, day, order, method, credential and eligibility rule passed.
   * Only here does it become permanent history, so a refused scan cannot create a
   * visit or a badge.
   */
  const visitOutcome = matchingStop.placeId
    ? await d.recordVerifiedVisit({ userId: input.userId, placeId: matchingStop.placeId, method: "qr", now })
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
