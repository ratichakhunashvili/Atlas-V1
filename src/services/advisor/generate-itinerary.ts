import { PLACE_CATEGORIES, type CheckInMethod, type Hotel, type ItineraryDay, type ItineraryStop, type Place, type PlaceCategory, type User, type UserPreferences } from "@/db/schema";
import type { LatLng } from "@/lib/geo";
import { buildCandidates, MAX_CANDIDATE_DISTANCE_METERS, type AdvisorCandidate } from "./candidates";
import { rankCandidates, type UsageHistory } from "./scoring";
import { calculateNextStopCount, type PreviousDayOutcome } from "./difficulty";
import { calculateDayNumber } from "./stay-day";
import { optimizeWalkingRoute } from "@/services/routing";

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
  | "insufficient_candidates"
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

export type HotelPlaceRow = {
  hotelId: string;
  placeId: string;
  priority: number | null;
  createdAt: Date;
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
  listFullPlacesNear: (center: LatLng, radiusMeters: number) => Promise<Place[]>;
  listPlacesForHotel: (hotelId: string) => Promise<HotelPlaceRow[]>;
  findItineraryDay: (userId: string, hotelId: string, dayNumber: number) => Promise<ItineraryDay | null>;
  findLatestItineraryDayBefore: (userId: string, hotelId: string, beforeDayNumber: number) => Promise<ItineraryDay | null>;
  listItineraryStops: (dayId: string) => Promise<ItineraryStop[]>;
  getStopUsageHistory: (userId: string, hotelId: string) => Promise<Map<string, number>>;
  persistItinerary: (input: PersistItineraryInput) => Promise<PersistItineraryResult>;
  optimizeWalkingRoute: typeof optimizeWalkingRoute;
};

async function loadDefaultDependencies(): Promise<GenerateItineraryDependencies> {
  const [usersQ, hotelStaysQ, preferencesQ, placesQ, hotelPlacesQ, itineraryQ] = await Promise.all([
    import("@/db/queries/users"),
    import("@/db/queries/hotel-stays"),
    import("@/db/queries/preferences"),
    import("@/db/queries/places"),
    import("@/db/queries/hotel-places"),
    import("@/db/queries/itinerary"),
  ]);

  return {
    findUserById: usersQ.findUserById,
    findActiveStayForUser: hotelStaysQ.findActiveStayForUser,
    findPreferencesForUser: preferencesQ.findPreferencesForUser,
    listFullPlacesNear: placesQ.listFullPlacesNear,
    listPlacesForHotel: hotelPlacesQ.listPlacesForHotel,
    findItineraryDay: itineraryQ.findItineraryDay,
    findLatestItineraryDayBefore: itineraryQ.findLatestItineraryDayBefore,
    listItineraryStops: itineraryQ.listItineraryStops,
    getStopUsageHistory: itineraryQ.getStopUsageHistory,
    persistItinerary: itineraryQ.persistItinerary,
    optimizeWalkingRoute,
  };
}

function toPlaceCategories(categories: readonly string[]): PlaceCategory[] {
  const valid = new Set<string>(PLACE_CATEGORIES);
  return categories.filter((category): category is PlaceCategory => valid.has(category));
}

function resolveCheckInMethod(candidate: AdvisorCandidate): CheckInMethod {
  if (candidate.isPartner) return "qr";
  if (QR_CHECK_IN_CATEGORIES.includes(candidate.place.category)) return "qr";
  return "gps";
}

type SelectedStop = {
  placeId: string;
  isHotelStop: boolean;
  checkInMethod: CheckInMethod;
  name: string;
  category: PlaceCategory | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  visitedAt: Date | null;
};

function fromCandidate(candidate: AdvisorCandidate): SelectedStop {
  return {
    placeId: candidate.place.id,
    isHotelStop: false,
    checkInMethod: resolveCheckInMethod(candidate),
    name: candidate.place.name,
    category: candidate.place.category,
    latitude: candidate.place.latitude,
    longitude: candidate.place.longitude,
    imageUrl: candidate.place.imageUrl,
    visitedAt: null,
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
    totalDurationSeconds: previous.totalDurationSeconds,
  };
}

/**
 * The Advisor orchestration layer: active HotelStay -> dayNumber -> cooldown
 * check -> difficulty -> candidates -> scoring -> partner guarantee ->
 * routing -> transactional persistence. Resolves everything itself from a
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
    // so they can regenerate today's plan immediately while testing.
    if (hoursSinceGeneration < GENERATION_COOLDOWN_HOURS && !isAdmin) {
      const stops = await d.listItineraryStops(existingDay.id);
      return { ok: true, itinerary: { day: existingDay, stops }, regenerated: false };
    }
  }

  const preferences = await d.findPreferencesForUser(userId);
  const selectedCategories = toPlaceCategories(preferences?.categories ?? []);
  // Admins testing without preferences set get the unfiltered pool; everyone
  // else must pick at least one interest before they can generate a plan —
  // exact original fallback (itinerary.ts: `filterByPreference`).
  const filterByPreference = !(isAdmin && selectedCategories.length === 0);
  if (filterByPreference && selectedCategories.length === 0) {
    return { ok: false, reason: "no_preferences", message: "Pick your interests in your profile before generating a plan." };
  }
  const categoriesForCandidates = filterByPreference ? selectedCategories : [...PLACE_CATEGORIES];

  const hotelLocation: LatLng = { lat: stay.place.latitude, lng: stay.place.longitude };

  const [nearbyPlaces, hotelPlaceRows] = await Promise.all([
    d.listFullPlacesNear(hotelLocation, MAX_CANDIDATE_DISTANCE_METERS),
    d.listPlacesForHotel(stay.hotel.id),
  ]);

  const candidates = buildCandidates({
    hotelLocation,
    hotelPlaceId: stay.place.id,
    nearbyPlaces,
    selectedCategories: categoriesForCandidates,
    hotelPlaceRelations: hotelPlaceRows.map((row) => ({ placeId: row.placeId, priority: row.priority })),
  });

  const usageHistory: UsageHistory = await d.getStopUsageHistory(userId, stay.hotel.id);
  const previousDayOutcome = await buildPreviousDayOutcome(d, userId, stay.hotel.id, dayNumber);
  const targetStopCount = calculateNextStopCount(previousDayOutcome);

  const rankedAll = rankCandidates(candidates, usageHistory);
  const rankedPartners = rankCandidates(
    candidates.filter((candidate) => candidate.isPartner),
    usageHistory
  );

  // At least one stop today must be a partner, or the hotel itself if none
  // are assigned yet — exact original rule (itinerary.ts: `usedHotelFallback`).
  const guaranteedSlotUsesHotelFiller = rankedPartners.length === 0;
  const chosen: AdvisorCandidate[] = [];
  const chosenPlaceIds = new Set<string>();

  if (!guaranteedSlotUsesHotelFiller) {
    const bestPartner = rankedPartners[0];
    chosen.push(bestPartner);
    chosenPlaceIds.add(bestPartner.place.id);
  }

  // The guaranteed slot (partner or filler) always accounts for exactly one
  // of targetStopCount; everything else comes from the ranked pool. Unlike
  // the original, a pool smaller than needed yields FEWER total stops rather
  // than repeating candidates — Atlas requires unique Places per itinerary.
  const targetChosenLength = guaranteedSlotUsesHotelFiller ? targetStopCount - 1 : targetStopCount;
  for (const candidate of rankedAll) {
    if (chosen.length >= targetChosenLength) break;
    if (chosenPlaceIds.has(candidate.place.id)) continue;
    chosen.push(candidate);
    chosenPlaceIds.add(candidate.place.id);
  }

  const selectedStops: SelectedStop[] = chosen.map(fromCandidate);
  if (guaranteedSlotUsesHotelFiller) {
    // The filler stop IS the hotel's own real Place — not a second kind of
    // Place entity. Auto-visited immediately (matches the original Advisor's
    // behavior, and Step 6's GPS check-in never requires a guest to
    // physically GPS-check-in at their own hotel): checkInMethod="auto"
    // means "already done," not "pending a future auto-completion step."
    selectedStops.push({
      placeId: stay.place.id,
      isHotelStop: true,
      checkInMethod: "auto",
      name: `Relax at ${stay.place.name}`,
      category: stay.place.category,
      latitude: stay.place.latitude,
      longitude: stay.place.longitude,
      imageUrl: stay.place.imageUrl,
      visitedAt: now,
    });
  }

  if (selectedStops.length === 0) {
    // Should be unreachable: the hotel filler alone guarantees >=1 stop
    // whenever zero partners exist, and the hotel's own Place always has
    // valid coordinates (schema-enforced). Kept as a defensive guard.
    return { ok: false, reason: "insufficient_candidates", message: "No eligible stops were found near this hotel." };
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
  const walkOrderedStops = order.map((index) => selectedStops[index]);

  // The hotel filler is a relax activity, not a destination — it always
  // leads the day so it never sits awkwardly mid-route (original rationale,
  // itinerary.ts lines 219-224).
  const hotelStop = walkOrderedStops.find((stop) => stop.isHotelStop);
  const finalStops = hotelStop ? [hotelStop, ...walkOrderedStops.filter((stop) => stop !== hotelStop)] : walkOrderedStops;

  // Normally false (every real stop starts unvisited) — true only in the
  // edge case where the itinerary is just the auto-visited hotel filler
  // (zero outside candidates at all), matching the same "all stops visited"
  // rule markStopVisitedViaGps applies after a GPS check-in.
  const allStopsAlreadyVisited = finalStops.every((stop) => stop.visitedAt !== null);

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
    completedAt: allStopsAlreadyVisited ? now : null,
    stops: finalStops.map((stop) => ({
      placeId: stop.placeId,
      isHotelStop: stop.isHotelStop,
      checkInMethod: stop.checkInMethod,
      name: stop.name,
      category: stop.category,
      latitude: stop.latitude,
      longitude: stop.longitude,
      imageUrl: stop.imageUrl,
      visitedAt: stop.visitedAt,
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
