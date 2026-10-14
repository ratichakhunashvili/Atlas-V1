import { type CheckInMethod, type Hotel, type ItineraryDay, type ItineraryStop, type Place, type PlaceCategory, type User, type UserPreferences } from "@/db/schema";
import type { LatLng } from "@/lib/geo";
import { buildCandidates, type AdvisorCandidate } from "./candidates";
import type { UsageHistory } from "./scoring";
import { chooseStops, resolveCandidateCategories } from "./stop-selection";
import { calculateNextStopCount, type PreviousDayOutcome } from "./difficulty";
import { calculateDayNumber } from "./stay-day";
import { optimizeWalkingRoute } from "@/services/routing";
import type { EligiblePlace } from "@/services/eligibility/rules";

// Type-only import: erased at compile time, so this module never statically
// pulls in a `server-only`-guarded db/queries module. Production callers get
// the real implementations lazily via loadDefaultDependencies(); tests
// always supply their own `deps` and never trigger that import at all. Same
// fix as services/routing/index.ts's resolveAccessToken, same reason — see
// that file's comment for the full story.
import type { PersistItineraryInput, PersistItineraryResult } from "@/db/queries/itinerary";

/** Guests get one generated plan per real day; admins are exempt so they can test freely — matches Map Advisor Functional's original cooldown AND preference-gating exemptions (itinerary.ts, GENERATION_COOLDOWN_HOURS / `isAdmin`). */
const GENERATION_COOLDOWN_HOURS = 24;

/** Landmark/historical stops are checked in with a scan instead of GPS — exact category set as Map Advisor Functional's AR_SCAN_ATTRACTION_CATEGORIES. */
const QR_CHECK_IN_CATEGORIES: readonly PlaceCategory[] = ["landmark", "historical"];

export type GenerationFailureReason =
  | "no_active_stay"
  | "outside_stay_period"
  | "no_preferences"
  /** No eligible hotel facility or active partner is available (at all, or for these interests/distance). Never filled with a substitute. */
  | "no_eligible_experiences"
  | "routing_failed"
  | "persistence_failed";

export type GenerateItineraryResult =
  | { ok: true; itinerary: { day: ItineraryDay; stops: ItineraryStop[] }; regenerated: boolean }
  | { ok: false; reason: GenerationFailureReason; message: string };

export type ActiveHotelStay = {
  id: string;
  checkIn: Date;
  checkOut: Date | null;
  hotel: Hotel;
  place: Place;
};

/**
 * The orchestrator's DB/Mapbox boundary, declared with explicit signatures
 * rather than `typeof realQueryFn`: the real query functions' `row ?? null`
 * pattern gets inferred by TS as non-nullable (destructuring a drizzle
 * result array apparently types the element as always-defined, making the
 * `?? null` branch dead code in TS's eyes even though it's reachable at
 * runtime) — deriving this interface from them would silently lose the
 * `| null` a fake test implementation legitimately needs to return.
 */
export type GenerateItineraryDependencies = {
  findUserById: (id: string) => Promise<User | null>;
  findActiveStayForUser: (userId: string) => Promise<ActiveHotelStay | null>;
  findPreferencesForUser: (userId: string) => Promise<UserPreferences | null>;
  /** The ONLY source of candidate Places: the hotel's own active facilities + its active, confirmed partners (services/eligibility). The hotelId passed in is always the one from the guest's own active stay. */
  listEligiblePlacesForStay: (stay: Pick<ActiveHotelStay, "hotel" | "place">, now: Date) => Promise<EligiblePlace[]>;
  findItineraryDay: (userId: string, hotelId: string, dayNumber: number) => Promise<ItineraryDay | null>;
  findLatestItineraryDayBefore: (userId: string, hotelId: string, beforeDayNumber: number) => Promise<ItineraryDay | null>;
  listItineraryStops: (dayId: string) => Promise<ItineraryStop[]>;
  getStopUsageHistory: (userId: string, hotelId: string) => Promise<Map<string, number>>;
  persistItinerary: (input: PersistItineraryInput) => Promise<PersistItineraryResult>;
  optimizeWalkingRoute: typeof optimizeWalkingRoute;
};

async function loadDefaultDependencies(): Promise<GenerateItineraryDependencies> {
  const [usersQ, hotelStaysQ, preferencesQ, eligibilityM, itineraryQ] = await Promise.all([
    import("@/db/queries/users"),
    import("@/db/queries/hotel-stays"),
    import("@/db/queries/preferences"),
    import("@/services/eligibility"),
    import("@/db/queries/itinerary"),
  ]);

  return {
    findUserById: usersQ.findUserById,
    findActiveStayForUser: hotelStaysQ.findActiveStayForUser,
    findPreferencesForUser: preferencesQ.findPreferencesForUser,
    listEligiblePlacesForStay: (stay, now) => eligibilityM.listEligiblePlacesForStay(stay, now),
    findItineraryDay: itineraryQ.findItineraryDay,
    findLatestItineraryDayBefore: itineraryQ.findLatestItineraryDayBefore,
    listItineraryStops: itineraryQ.listItineraryStops,
    getStopUsageHistory: itineraryQ.getStopUsageHistory,
    persistItinerary: itineraryQ.persistItinerary,
    optimizeWalkingRoute,
  };
}

function resolveCheckInMethod(candidate: AdvisorCandidate): CheckInMethod {
  if (candidate.isPartner) return "qr";
  if (QR_CHECK_IN_CATEGORIES.includes(candidate.place.category)) return "qr";
  return "gps";
}

/** Every stop is a real eligible Place the guest actually has to visit; the hotel is only the route's origin/return point, never a stop. */
type SelectedStop = {
  placeId: string;
  checkInMethod: CheckInMethod;
  name: string;
  category: PlaceCategory | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
};

function fromCandidate(candidate: AdvisorCandidate): SelectedStop {
  return {
    placeId: candidate.place.id,
    checkInMethod: resolveCheckInMethod(candidate),
    name: candidate.place.name,
    category: candidate.place.category,
    latitude: candidate.place.latitude,
    longitude: candidate.place.longitude,
    imageUrl: candidate.place.imageUrl,
  };
}

async function buildPreviousDayOutcome(
  deps: Pick<GenerateItineraryDependencies, "findLatestItineraryDayBefore" | "listItineraryStops">,
  userId: string,
  hotelId: string,
  currentDayNumber: number
): Promise<PreviousDayOutcome | null> {
  const previous = await deps.findLatestItineraryDayBefore(userId, hotelId, currentDayNumber);
  if (!previous) return null;

  const stops = await deps.listItineraryStops(previous.id);
  const allStopsVisited = stops.length > 0 && stops.every((stop) => stop.visitedAt !== null);

  return {
    stopCount: previous.stopCount,
    allStopsVisited,
    completedAt: previous.completedAt,
    generatedAt: previous.generatedAt,
    // The ORIGINAL generated estimate (a repair updates totalDurationSeconds to the repaired route, but the
    // ratchet must keep judging the guest against what was originally planned). Older rows fall back to the total.
    totalDurationSeconds: previous.originalDurationSeconds ?? previous.totalDurationSeconds,
  };
}

/**
 * The Advisor orchestration layer: active HotelStay -> dayNumber -> cooldown
 * check -> difficulty -> eligible candidates -> scoring -> partner priority ->
 * routing (hotel = origin and return point) -> transactional persistence. Resolves everything itself from a
 * plain `userId` (no session/auth here — that's the caller's job, matching
 * every other services/* module in Atlas); accepts `deps` purely for testing
 * so a caller never needs a real DB or a real Mapbox account to exercise
 * this logic end-to-end.
 */
export async function generateItineraryForUser(
  userId: string,
  now: Date = new Date(),
  deps?: GenerateItineraryDependencies
): Promise<GenerateItineraryResult> {
  const d = deps ?? (await loadDefaultDependencies());

  const user = await d.findUserById(userId);
  if (!user) {
    return { ok: false, reason: "no_active_stay", message: "User not found." };
  }
  const isAdmin = user.role === "admin";

  const stay = await d.findActiveStayForUser(userId);
  if (!stay) {
    return { ok: false, reason: "no_active_stay", message: "You need an active hotel stay to generate a plan." };
  }

  const dayNumberResult = calculateDayNumber(stay.checkIn, stay.checkOut, now);
  if (!dayNumberResult.ok) {
    return { ok: false, reason: "outside_stay_period", message: dayNumberResult.message };
  }
  const dayNumber = dayNumberResult.dayNumber;

  const existingDay = await d.findItineraryDay(userId, stay.hotel.id, dayNumber);
  if (existingDay) {
    const hoursSinceGeneration = (now.getTime() - existingDay.generatedAt.getTime()) / 3600000;
    // Admins bypass the cooldown (preserved from the original's `if (previousDay && !isAdmin)`)
    // so they can regenerate today's plan immediately while testing. This is the ONLY cooldown
    // exception here: an ordinary Generate never changes an existing day, even when one of its
    // pending stops has become unavailable — that needs the dedicated, explicit plan-repair action
    // (services/advisor/plan-repair.ts), so the route can never change silently.
    if (hoursSinceGeneration < GENERATION_COOLDOWN_HOURS && !isAdmin) {
      const stops = await d.listItineraryStops(existingDay.id);
      return { ok: true, itinerary: { day: existingDay, stops }, regenerated: false };
    }
  }

  const preferences = await d.findPreferencesForUser(userId);
  // Admins testing without preferences get the unfiltered pool; everyone else must pick at least one
  // interest before they can generate a plan — exact original fallback.
  const categoriesForCandidates = resolveCandidateCategories(isAdmin, preferences);
  if (!categoriesForCandidates) {
    return { ok: false, reason: "no_preferences", message: "Pick your interests in your profile before generating a plan." };
  }

  const hotelLocation: LatLng = { lat: stay.place.latitude, lng: stay.place.longitude };

  // Eligibility is resolved from THIS guest's own active stay (stay.hotel), never from a client-supplied id.
  const eligiblePlaces = await d.listEligiblePlacesForStay(stay, now);

  const candidates = buildCandidates({
    hotelLocation,
    hotelPlaceId: stay.place.id,
    eligiblePlaces,
    selectedCategories: categoriesForCandidates,
  });

  // A rebuild of an existing day KEEPS its completed stops (history and scoring are never touched); only
  // PENDING stops are superseded, and only as many new stops are added as the target still needs.
  const existingStops = existingDay ? await d.listItineraryStops(existingDay.id) : [];
  const completedStops = existingStops.filter((stop) => stop.visitedAt !== null);
  const completedPlaceIds = new Set(completedStops.flatMap((stop) => (stop.placeId ? [stop.placeId] : [])));

  const usageHistory: UsageHistory = await d.getStopUsageHistory(userId, stay.hotel.id);
  const previousDayOutcome = await buildPreviousDayOutcome(d, userId, stay.hotel.id, dayNumber);
  const targetStopCount = calculateNextStopCount(previousDayOutcome);
  const neededNewStops = Math.max(0, targetStopCount - completedStops.length);

  if (existingDay && neededNewStops === 0) {
    // The day already has all the completed stops it is meant to have: nothing to add, nothing to change.
    return { ok: true, itinerary: { day: existingDay, stops: existingStops }, regenerated: false };
  }

  const chosen = chooseStops({ candidates, usageHistory, targetCount: neededNewStops, excludePlaceIds: completedPlaceIds });
  const selectedStops: SelectedStop[] = chosen.map(fromCandidate);

  if (selectedStops.length === 0) {
    // Nothing is persisted: no empty day, no fake stop. An existing day (and its history) is left untouched.
    return {
      ok: false,
      reason: "no_eligible_experiences",
      message:
        eligiblePlaces.length === 0
          ? `${stay.place.name} doesn't have any approved facilities or partners available yet.`
          : "None of your hotel's approved experiences match your interests within walking distance. Try different interests.",
    };
  }

  const routeResult = await d.optimizeWalkingRoute({
    origin: hotelLocation,
    stops: selectedStops.map((stop) => ({ lat: stop.latitude, lng: stop.longitude })),
    returnToOrigin: true,
  });
  if (!routeResult.ok) {
    return { ok: false, reason: "routing_failed", message: routeResult.message };
  }

  const { order, geometry, totalDurationSeconds } = routeResult.route;
  if (order.length !== selectedStops.length || order.some((index) => selectedStops[index] === undefined)) {
    return { ok: false, reason: "routing_failed", message: "Mapbox returned a malformed route order." };
  }
  // The route order is whatever the optimizer returned: hotel -> stops -> hotel. The hotel itself is never a stop.
  const finalStops = order.map((index) => selectedStops[index]);

  const persistResult = await d.persistItinerary({
    userId,
    hotelId: stay.hotel.id,
    hotelStayId: stay.id,
    dayNumber,
    existingDayId: existingDay?.id ?? null,
    routeGeoJson: geometry,
    // Mapbox returns fractional seconds (e.g. 448.9); itinerary_days.total_duration_seconds is an integer column.
    totalDurationSeconds: Math.round(totalDurationSeconds),
    generatedAt: now,
    // Every new stop starts unvisited, so a freshly generated day is never already complete.
    completedAt: null,
    // Only the NEW pending stops: on a rebuild the persistence layer keeps completed stops and supersedes
    // (never deletes) the old pending ones.
    stops: finalStops.map((stop) => ({
      placeId: stop.placeId,
      // Legacy column: only itineraries generated before the filler was removed contain a hotel stop.
      isHotelStop: false,
      checkInMethod: stop.checkInMethod,
      name: stop.name,
      category: stop.category,
      latitude: stop.latitude,
      longitude: stop.longitude,
      imageUrl: stop.imageUrl,
      visitedAt: null,
    })),
  });

  if (persistResult.status === "conflict") {
    // Lost a race with a concurrent generation request for this same new
    // day — report the day that won instead of failing.
    const winningDay = await d.findItineraryDay(userId, stay.hotel.id, dayNumber);
    if (!winningDay) {
      return { ok: false, reason: "persistence_failed", message: "Could not save the itinerary right now. Please try again." };
    }
    const stops = await d.listItineraryStops(winningDay.id);
    return { ok: true, itinerary: { day: winningDay, stops }, regenerated: false };
  }

  return {
    ok: true,
    itinerary: { day: persistResult.day, stops: persistResult.stops },
    regenerated: true,
  };
}
