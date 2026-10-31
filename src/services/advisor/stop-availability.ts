import type { ItineraryDay, ItineraryStop } from "@/db/schema";
import type { EligiblePlace } from "@/services/eligibility/rules";
import { calculateDayNumber, stayEndFor } from "./stay-day";

/**
 * THE one place that decides whether a PENDING itinerary stop is still
 * available to the guest. Saved itineraries are history; eligibility is
 * re-checked when the guest ACTS (check-in, directions, plan repair) and when
 * the plan is DISPLAYED — never by silently rewriting the plan.
 *
 * WHICH DAY CAN BE CHECKED IN: only the guest's CURRENT day. The server computes
 * the current day number from the guest's own stay (calculateDayNumber over the
 * stay's check-in/check-out and the server clock) and a stop can only be acted on
 * if its itinerary day is exactly that day of exactly that stay and hotel. No
 * client-supplied date, day number or stay id is ever read: an earlier day's (or a
 * future day's) pending stops are not checkable, even for the same stay.
 *
 * A pending stop is available only if ALL hold:
 *  - the guest has a valid active stay (open, started, not ended);
 *  - the stop's day belongs to THAT stay and hotel, and is the stay's CURRENT day;
 *  - the stop still points at a Place (it was not deleted);
 *  - that Place is in the eligible set of the stay's hotel (services/eligibility): active
 *    facility or active, confirmed, in-window partnership, with the Place published,
 *    verified and not archived.
 *
 * Completed stops are NEVER re-evaluated: history and completed visits are untouched.
 */

export type StopUnavailableReason = "no_valid_stay" | "different_stay" | "not_current_day" | "place_removed" | "not_eligible";

export type StopAvailability = { available: true } | { available: false; reason: StopUnavailableReason };

export type AvailabilityContext = {
  /**
   * The guest's valid active stay, or null when they have none. `dayNumber` is the stay's CURRENT day,
   * computed on the server from the stay dates and the server clock — never taken from the client.
   */
  stay: { id: string; hotelId: string; dayNumber: number } | null;
  /** Ids of the Places eligible for that stay's hotel right now. Empty when there is no valid stay. */
  eligiblePlaceIds: ReadonlySet<string>;
  /** Of those, the ids that are the hotel's OWN facilities (not external partners). Used only to classify missions; may be absent in older contexts. */
  facilityPlaceIds?: ReadonlySet<string>;
};

/** Loads the guest's current availability context FRESH. Called again immediately before a check-in write. */
export type AvailabilityContextLoader = (userId: string, now: Date) => Promise<AvailabilityContext>;

type StayLike = { id: string; hotel: { id: string }; checkIn: Date; checkOut: Date | null };

export function contextFromEligible(
  stay: StayLike | null,
  eligible: readonly (Pick<EligiblePlace, "place"> & Partial<Pick<EligiblePlace, "source">>)[],
  now: Date
): AvailabilityContext {
  const none: AvailabilityContext = { stay: null, eligiblePlaceIds: new Set() };
  if (!stay) return none;
  // The current day comes from the stay's own dates and the SERVER clock. A stay that has not started or has
  // already ended has no current day, so it is not a valid stay for acting on a route.
  const current = calculateDayNumber(stay.checkIn, stayEndFor(stay), now);
  if (!current.ok) return none;
  return {
    stay: { id: stay.id, hotelId: stay.hotel.id, dayNumber: current.dayNumber },
    eligiblePlaceIds: new Set(eligible.map((entry) => entry.place.id)),
    facilityPlaceIds: new Set(eligible.filter((entry) => entry.source === "facility").map((entry) => entry.place.id)),
  };
}

export type DayCheckIn = { ok: true } | { ok: false; reason: "no_valid_stay" | "different_stay" | "not_current_day" };

/**
 * Pure: may stops of THIS itinerary day be acted on right now? Only the guest's current day of their own
 * current stay and hotel. An earlier day (even of the same stay), a future day, another stay or another
 * hotel is refused.
 */
export function evaluateDayCheckIn(day: Pick<ItineraryDay, "hotelId" | "hotelStayId" | "dayNumber">, context: AvailabilityContext): DayCheckIn {
  if (!context.stay) return { ok: false, reason: "no_valid_stay" };
  if (day.hotelStayId === null || day.hotelStayId !== context.stay.id || day.hotelId !== context.stay.hotelId) {
    return { ok: false, reason: "different_stay" };
  }
  if (day.dayNumber !== context.stay.dayNumber) return { ok: false, reason: "not_current_day" };
  return { ok: true };
}

/** Pure: availability of ONE stop (meaningful for pending stops) given a context. */
export function evaluateStopAvailability(
  stop: Pick<ItineraryStop, "placeId">,
  day: Pick<ItineraryDay, "hotelId" | "hotelStayId" | "dayNumber">,
  context: AvailabilityContext
): StopAvailability {
  const dayCheck = evaluateDayCheckIn(day, context);
  if (!dayCheck.ok) return { available: false, reason: dayCheck.reason };
  if (stop.placeId === null) return { available: false, reason: "place_removed" };
  if (!context.eligiblePlaceIds.has(stop.placeId)) return { available: false, reason: "not_eligible" };
  return { available: true };
}

/** Availability of every PENDING stop of a day (completed stops are not in the map — they are never re-evaluated). */
export function evaluatePendingStops(
  stops: readonly ItineraryStop[],
  day: Pick<ItineraryDay, "hotelId" | "hotelStayId" | "dayNumber">,
  context: AvailabilityContext
): Map<string, StopAvailability> {
  const result = new Map<string, StopAvailability>();
  for (const stop of stops) {
    if (stop.visitedAt !== null || stop.supersededAt !== null) continue;
    result.set(stop.id, evaluateStopAvailability(stop, day, context));
  }
  return result;
}

export function isAvailable(availability: StopAvailability | undefined): boolean {
  return availability?.available === true;
}

/** Plain-language reason shown to the guest. */
export function unavailableMessage(reason: StopUnavailableReason): string {
  switch (reason) {
    case "no_valid_stay":
      return "Your hotel stay isn't active, so this stop can't be used.";
    case "different_stay":
      return "This stop belongs to a different stay.";
    case "not_current_day":
      return "This stop belongs to a different day's route.";
    case "place_removed":
    case "not_eligible":
      return "This stop is no longer available through your hotel.";
  }
}

// Lazy import: the eligibility service loads db/queries (server-only), which must not be
// evaluated under plain `node --test`. Same pattern as every other services/* module.
export const loadDefaultAvailabilityContext: AvailabilityContextLoader = async (userId, now) => {
  const eligibility = await import("@/services/eligibility");
  const resolved = await eligibility.resolveGuestHotelContext(userId, now);
  if (!resolved.ok) return contextFromEligible(null, [], now);
  const eligible = await eligibility.listEligiblePlacesForStay(resolved.stay, now);
  return contextFromEligible(resolved.stay, eligible, now);
};
