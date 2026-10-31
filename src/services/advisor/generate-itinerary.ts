import { type CheckInMethod, type Hotel, type ItineraryDay, type ItineraryStop, type Place, type PlaceCategory, type User, type UserPreferences } from "@/db/schema";
import type { LatLng } from "@/lib/geo";
import { buildCandidates, type AdvisorCandidate } from "./candidates";
import type { UsageHistory } from "./scoring";
import { chooseStops, resolveCandidateCategories } from "./stop-selection";
import { applyPaceToStopCount } from "./preference-ranking";
import { calculateNextStopCount, type PreviousDayOutcome } from "./difficulty";
import { calculateDayNumber, stayEndFor } from "./stay-day";
import { getWalkingRouteInOrder, optimizeWalkingRoute, type RouteGeometry } from "@/services/routing";
import { chooseEventForPlan, eventDurationMinutes, evaluateEventArrival } from "./hotel-events";
import { placeHotelActivities, placementForDay, placementForEvent } from "./stop-placement";
import { estimateWalkMinutes, fitStopsToBudget, fitsInBudget, isAvailableMinutesOption, type AvailableMinutes } from "./time-budget";
import { resolveVisitDuration } from "./visit-duration";
import type { EligiblePlace } from "@/services/eligibility/rules";
import type { HotelEvent } from "@/db/schema";

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
  /** Nothing the hotel offers fits the free time the guest chose — not even one stop and the walk back. */
  | "no_plan_fits_time"
  | "routing_failed"
  | "persistence_failed";

/** The window Atlas plans for when no guest chose one — stated, recorded and never silently different. */
export const DEFAULT_AVAILABLE_MINUTES: AvailableMinutes = 120;

export type GenerateItineraryOptions = {
  /** Free time in minutes, from AVAILABLE_MINUTE_OPTIONS. Anything else falls back to DEFAULT_AVAILABLE_MINUTES. */
  availableMinutes?: number;
};

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
  /** Routes a FIXED order, used whenever a hotel activity has been pinned to an end of the day. */
  getWalkingRouteInOrder: typeof getWalkingRouteInOrder;
  /** This hotel's own scheduled events. Hotel-specific like everything else: another hotel's events are never read. */
  listUpcomingHotelEvents: (hotelId: string, from: Date) => Promise<HotelEvent[]>;
};

async function loadDefaultDependencies(): Promise<GenerateItineraryDependencies> {
  const [usersQ, hotelStaysQ, preferencesQ, eligibilityM, itineraryQ, eventsQ] = await Promise.all([
    import("@/db/queries/users"),
    import("@/db/queries/hotel-stays"),
    import("@/db/queries/preferences"),
    import("@/services/eligibility"),
    import("@/db/queries/itinerary"),
    import("@/db/queries/hotel-events"),
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
    getWalkingRouteInOrder,
    listUpcomingHotelEvents: eventsQ.listUpcomingHotelEvents,
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
  /** Snapshotted onto the stop so the saved plan still explains its own shape after the Place is edited. */
  visitDurationMinutes: number;
  /** A hotel-owned facility or a hotel event: pinned to an end of the route, never the middle. */
  hotelActivity: "facility" | "event" | null;
  /** When the event starts and ends, for an event stop only. Its placement and attendance are timing facts, not preferences. */
  eventStartsAt: Date | null;
  eventEndsAt: Date | null;
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
    visitDurationMinutes: resolveVisitDuration(candidate.place).minutes,
    // A candidate that is not a partner is one of the hotel's own facilities.
    hotelActivity: candidate.isPartner ? null : "facility",
    eventStartsAt: null,
    eventEndsAt: null,
  };
}

/**
 * A scheduled event becomes a stop at its venue Place. It is the venue that is
 * visited and checked in to — the event adds the title, the time and how long to
 * budget. No reservation is made or implied.
 */
function fromEvent(event: HotelEvent, venue: Place): SelectedStop {
  return {
    placeId: venue.id,
    checkInMethod: resolveCheckInMethod({ place: venue, distanceMeters: 0, isPartner: false, partnerPriority: null }),
    name: event.title,
    category: venue.category,
    latitude: venue.latitude,
    longitude: venue.longitude,
    imageUrl: venue.imageUrl,
    visitDurationMinutes: eventDurationMinutes(event),
    hotelActivity: "event",
    eventStartsAt: event.startsAt,
    eventEndsAt: event.endsAt,
  };
}

function totalVisitMinutes(stops: readonly SelectedStop[]): number {
  return stops.reduce((total, stop) => total + stop.visitDurationMinutes, 0);
}

/**
 * Moves the best-ranked hotel facility directly behind the leading partner.
 *
 * The product asks for a suitable facility whenever one fits, and the time budget
 * takes stops in order — so a facility ranked tenth would almost never survive.
 * This changes only WHERE a facility is offered, never whether it is eligible.
 */
function promoteFirstFacility(stops: readonly SelectedStop[]): SelectedStop[] {
  const index = stops.findIndex((stop) => stop.hotelActivity === "facility");
  if (index <= 1) return [...stops];

  const facility = stops[index];
  const rest = stops.filter((_, position) => position !== index);
  return [rest[0], facility, ...rest.slice(1)];
}

/** Resolves the one scheduled event this plan may include, or null. Hotel-specific and eligibility-checked like any other stop. */
async function resolveEventStop(
  deps: Pick<GenerateItineraryDependencies, "listUpcomingHotelEvents">,
  input: {
    hotelId: string;
    eligiblePlaces: readonly EligiblePlace[];
    now: Date;
    availableMinutes: number;
    excludePlaceIds: ReadonlySet<string>;
  }
): Promise<SelectedStop | null> {
  const events = await deps.listUpcomingHotelEvents(input.hotelId, input.now);
  if (events.length === 0) return null;

  const eligibleById = new Map(input.eligiblePlaces.map(({ place }) => [place.id, place]));

  const event = chooseEventForPlan({
    events,
    hotelId: input.hotelId,
    // The venue must pass the same eligibility as any other stop: an event cannot
    // smuggle in a Place the hotel is not approved for.
    eligiblePlaceIds: new Set(eligibleById.keys()),
    now: input.now,
    availableMinutes: input.availableMinutes,
  });
  if (!event) return null;

  // Already completed today: history is never re-offered.
  if (input.excludePlaceIds.has(event.venuePlaceId)) return null;

  const venue = eligibleById.get(event.venuePlaceId);
  if (!venue) return null;

  return fromEvent(event, venue);
}

type RoutedPlan =
  | { ok: true; stops: SelectedStop[]; geometry: RouteGeometry; totalDurationSeconds: number }
  | { ok: false; reason: "routing_failed"; message: string }
  | { ok: false; reason: "no_plan_fits_time"; message: string };

/**
 * Turns chosen stops into a real, ordered, routed day that fits the guest's window.
 *
 * Order comes from Mapbox's optimizer for the ordinary stops, then any hotel
 * activity is pinned to an end (stop-placement.ts) and the whole sequence is
 * re-routed IN THAT ORDER, so the geometry always matches the order the guest is
 * shown. Nothing is ever drawn as a straight line or assumed.
 *
 * The estimate used during selection is deliberately cautious, but it is still an
 * estimate; this is where the REAL walking time is checked against the window. If
 * the real route overruns, the last ordinary stop is dropped and the remainder is
 * re-routed — shrinking the day rather than quietly handing the guest a plan that
 * does not fit. The loop is bounded by the number of stops.
 */
async function routeWithinBudget(
  deps: Pick<GenerateItineraryDependencies, "optimizeWalkingRoute" | "getWalkingRouteInOrder">,
  input: {
    hotelLocation: LatLng;
    stops: readonly SelectedStop[];
    dayNumber: number;
    now: Date;
    availableMinutes: number;
  }
): Promise<RoutedPlan> {
  let remaining = [...input.stops];

  while (remaining.length > 0) {
    const ordered = await orderStops(deps, { hotelLocation: input.hotelLocation, stops: remaining, dayNumber: input.dayNumber, now: input.now, availableMinutes: input.availableMinutes });
    if (!ordered.ok) return ordered;

    /*
     * Now that the stops have a real order, check that the event is one the guest
     * can actually attend: the walk and the earlier visits take however long they
     * take, and the event does not wait. An early arrival is a failure too — no
     * plan contains a "wait outside for half an hour" step, so Atlas will not
     * promise one. An unattendable event is dropped and the day re-routed without it.
     */
    const withAttendance = applyEventAttendance(ordered.stops, input.hotelLocation, input.now);
    if (withAttendance.dropEventId !== null) {
      remaining = ordered.stops.filter((stop) => stop.placeId !== withAttendance.dropEventId || stop.hotelActivity !== "event");
      if (remaining.length === 0) {
        return { ok: false, reason: "no_plan_fits_time", message: "No plan fits the chosen window." };
      }
      continue;
    }

    const stopsForPlan = withAttendance.stops;
    const visitMinutes = totalVisitMinutes(stopsForPlan);
    if (
      fitsInBudget({
        routeSeconds: ordered.totalDurationSeconds,
        visitMinutes,
        budgetMinutes: input.availableMinutes,
      })
    ) {
      return { ok: true, stops: stopsForPlan, geometry: ordered.geometry, totalDurationSeconds: ordered.totalDurationSeconds };
    }

    // Drop the least important stop still in the day: the last ordinary one, or
    // the hotel activity if that is all that is left besides the event.
    const dropIndex = findDroppableIndex(ordered.stops);
    if (dropIndex === -1) {
      return { ok: false, reason: "no_plan_fits_time", message: "No plan fits the chosen window." };
    }
    remaining = ordered.stops.filter((_, index) => index !== dropIndex);
  }

  return { ok: false, reason: "no_plan_fits_time", message: "No plan fits the chosen window." };
}

/**
 * Checks the event stop against when the routed day actually gets the guest there,
 * and rewrites its budgeted time to what is left of the event.
 *
 * Arrival is estimated from the ROUTED ORDER: the walking legs along that order
 * plus the time spent at every earlier stop. It is an estimate — the same cautious
 * one used to choose stops — because Mapbox's in-order route reports a single
 * duration rather than per-leg times. Treating it as exact would be the more
 * dangerous mistake, since it decides whether a guest is sent to something that
 * has already finished.
 *
 * Returns the id of an event to drop, or the stops with the event's time corrected.
 */
function applyEventAttendance(
  stops: readonly SelectedStop[],
  hotelLocation: LatLng,
  now: Date
): { stops: SelectedStop[]; dropEventId: string | null } {
  const eventIndex = stops.findIndex((stop) => stop.hotelActivity === "event");
  if (eventIndex === -1) return { stops: [...stops], dropEventId: null };

  const event = stops[eventIndex];
  if (!event.eventStartsAt || !event.eventEndsAt) return { stops: [...stops], dropEventId: null };

  let minutes = 0;
  let from = hotelLocation;

  for (let index = 0; index < eventIndex; index += 1) {
    const stop = stops[index];
    minutes += estimateWalkMinutes(from, { lat: stop.latitude, lng: stop.longitude });
    minutes += stop.visitDurationMinutes;
    from = { lat: stop.latitude, lng: stop.longitude };
  }
  minutes += estimateWalkMinutes(from, { lat: event.latitude, lng: event.longitude });

  const arrival = new Date(now.getTime() + minutes * 60_000);
  const attendance = evaluateEventArrival({
    startsAt: event.eventStartsAt,
    endsAt: event.eventEndsAt,
    estimatedArrival: arrival,
  });

  if (!attendance.ok) {
    return { stops: [...stops], dropEventId: event.placeId };
  }

  // Budget only what is left of the event, never its full length.
  const corrected = stops.map((stop, index) =>
    index === eventIndex ? { ...stop, visitDurationMinutes: attendance.attendMinutes } : stop
  );
  return { stops: corrected, dropEventId: null };
}

/** The last ordinary stop, else the last facility, else -1 when only a single stop (or only the event) remains. */
function findDroppableIndex(stops: readonly SelectedStop[]): number {
  if (stops.length <= 1) return -1;

  for (let index = stops.length - 1; index >= 0; index -= 1) {
    if (stops[index].hotelActivity === null) return index;
  }
  for (let index = stops.length - 1; index >= 0; index -= 1) {
    if (stops[index].hotelActivity === "facility") return index;
  }
  return -1;
}

type OrderedStops =
  | { ok: true; stops: SelectedStop[]; geometry: RouteGeometry; totalDurationSeconds: number }
  | { ok: false; reason: "routing_failed"; message: string };

async function orderStops(
  deps: Pick<GenerateItineraryDependencies, "optimizeWalkingRoute" | "getWalkingRouteInOrder">,
  input: { hotelLocation: LatLng; stops: readonly SelectedStop[]; dayNumber: number; now: Date; availableMinutes: number }
): Promise<OrderedStops> {
  const event = input.stops.find((stop) => stop.hotelActivity === "event") ?? null;
  const ordinary = input.stops.filter((stop) => stop.hotelActivity === null);

  /*
   * Only the FIRST facility is pinned, and only when the day has somewhere else to
   * go. Pinning the spa to the end of a day made ENTIRELY of the hotel's own
   * facilities protects nothing — there is no walk out and back to spoil — and it
   * would needlessly force a fixed order on stops the optimizer could sequence
   * better. Any further facilities are ordinary stops in the middle.
   */
  const facility =
    ordinary.length > 0 ? input.stops.find((stop) => stop.hotelActivity === "facility") ?? null : null;
  const middle = input.stops.filter((stop) => stop !== facility && stop !== event);

  let orderedMiddle: SelectedStop[] = [];

  if (middle.length > 0) {
    const optimized = await deps.optimizeWalkingRoute({
      origin: input.hotelLocation,
      stops: middle.map((stop) => ({ lat: stop.latitude, lng: stop.longitude })),
      returnToOrigin: true,
    });
    if (!optimized.ok) return { ok: false, reason: "routing_failed", message: optimized.message };

    const { order } = optimized.route;
    if (order.length !== middle.length || order.some((index) => middle[index] === undefined)) {
      return { ok: false, reason: "routing_failed", message: "Mapbox returned a malformed route order." };
    }
    orderedMiddle = order.map((index) => middle[index]);

    // No hotel activity to pin: the optimizer's own route already matches this order.
    if (!facility && !event) {
      return {
        ok: true,
        stops: orderedMiddle,
        geometry: optimized.route.geometry,
        totalDurationSeconds: optimized.route.totalDurationSeconds,
      };
    }
  }

  const stops = placeHotelActivities({
    middle: orderedMiddle,
    facility: facility ? { stop: facility, placement: placementForDay(input.dayNumber) } : null,
    event: event
      ? {
          stop: event,
          placement: placementForEvent({
            startsAt: event.eventStartsAt ?? input.now,
            now: input.now,
            availableMinutes: input.availableMinutes,
          }),
        }
      : null,
  });

  // The pinned order is the order the guest will walk, so it is the order routed —
  // never re-optimised behind their back.
  const inOrder = await deps.getWalkingRouteInOrder({
    origin: input.hotelLocation,
    stops: stops.map((stop) => ({ lat: stop.latitude, lng: stop.longitude })),
    returnToOrigin: true,
  });
  if (!inOrder.ok) return { ok: false, reason: "routing_failed", message: inOrder.message };

  return {
    ok: true,
    stops,
    geometry: inOrder.route.geometry,
    totalDurationSeconds: inOrder.route.durationSeconds,
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
  deps?: GenerateItineraryDependencies,
  options: GenerateItineraryOptions = {}
): Promise<GenerateItineraryResult> {
  const d = deps ?? (await loadDefaultDependencies());

  // The window the guest chose. Validated against the offered options rather than
  // trusted: an arbitrary number from a client would let someone ask for a
  // ten-hour plan. Callers without a guest to ask (dev tools, the scenario tool)
  // get the documented default, which is recorded on the day like any other.
  const availableMinutes: AvailableMinutes = isAvailableMinutesOption(options.availableMinutes)
    ? options.availableMinutes
    : DEFAULT_AVAILABLE_MINUTES;

  const user = await d.findUserById(userId);
  if (!user) {
    return { ok: false, reason: "no_active_stay", message: "User not found." };
  }
  const isAdmin = user.role === "admin";

  const stay = await d.findActiveStayForUser(userId);
  if (!stay) {
    return { ok: false, reason: "no_active_stay", message: "You need an active hotel stay to generate a plan." };
  }

  const dayNumberResult = calculateDayNumber(stay.checkIn, stayEndFor(stay), now);
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
    preferredMaxDistanceMeters: preferences?.maxDistanceMeters ?? null,
  });

  // A rebuild of an existing day KEEPS its completed stops (history and scoring are never touched); only
  // PENDING stops are superseded, and only as many new stops are added as the target still needs.
  const existingStops = existingDay ? await d.listItineraryStops(existingDay.id) : [];
  const completedStops = existingStops.filter((stop) => stop.visitedAt !== null);
  const completedPlaceIds = new Set(completedStops.flatMap((stop) => (stop.placeId ? [stop.placeId] : [])));

  const usageHistory: UsageHistory = await d.getStopUsageHistory(userId, stay.hotel.id);
  const previousDayOutcome = await buildPreviousDayOutcome(d, userId, stay.hotel.id, dayNumber);
  // The ratchet sets how many stops the guest has earned; their pace can only trim that, never add to it.
  const targetStopCount = applyPaceToStopCount(calculateNextStopCount(previousDayOutcome), preferences?.activityLevel ?? null);
  const neededNewStops = Math.max(0, targetStopCount - completedStops.length);

  if (existingDay && neededNewStops === 0) {
    // The day already has all the completed stops it is meant to have: nothing to add, nothing to change.
    return { ok: true, itinerary: { day: existingDay, stops: existingStops }, regenerated: false };
  }

  // Ranked once, over the whole eligible pool: partner first, then freshness and
  // distance (scoring.ts). The time budget then decides how much of that order fits,
  // rather than a count deciding it alone.
  const ranked = chooseStops({
    candidates,
    usageHistory,
    targetCount: candidates.length,
    excludePlaceIds: completedPlaceIds,
    preferences: { budget: preferences?.budget ?? null },
  });

  // A scheduled event is the only stop with a fixed clock time, so it is offered to
  // the budget first — everything else can move, it cannot.
  const eventStop = await resolveEventStop(d, {
    hotelId: stay.hotel.id,
    eligiblePlaces,
    now,
    availableMinutes,
    excludePlaceIds: completedPlaceIds,
  });

  const rankedStops = promoteFirstFacility(ranked.map(fromCandidate)).filter(
    (stop) => !eventStop || stop.placeId !== eventStop.placeId
  );

  const offered = eventStop ? [eventStop, ...rankedStops] : rankedStops;

  const selectedStops = fitStopsToBudget({
    hotelLocation,
    candidates: offered.map((stop) => ({
      stop,
      location: { lat: stop.latitude, lng: stop.longitude },
      visitMinutes: stop.visitDurationMinutes,
    })),
    budgetMinutes: availableMinutes,
    maxStops: neededNewStops,
  }).map((fitted) => fitted.stop);

  if (selectedStops.length === 0) {
    // Nothing is persisted: no empty day, no fake stop. An existing day (and its history) is left untouched.
    if (offered.length > 0) {
      // There ARE eligible experiences; none of them fits this window once the walk
      // there, the time spent and the walk home are counted. Say so plainly instead
      // of pretending the hotel has nothing.
      return {
        ok: false,
        reason: "no_plan_fits_time",
        message: `Nothing your hotel offers fits into ${availableMinutes} minutes, including the walk back. Try a longer window.`,
      };
    }
    return {
      ok: false,
      reason: "no_eligible_experiences",
      message:
        eligiblePlaces.length === 0
          ? `${stay.place.name} doesn't have any approved facilities or partners available yet.`
          : "None of your hotel's approved experiences match your interests within walking distance. Try different interests.",
    };
  }

  const routed = await routeWithinBudget(d, {
    hotelLocation,
    stops: selectedStops,
    dayNumber,
    now,
    availableMinutes,
  });

  if (!routed.ok) {
    return routed.reason === "no_plan_fits_time"
      ? {
          ok: false,
          reason: "no_plan_fits_time",
          message: `Nothing your hotel offers fits into ${availableMinutes} minutes, including the walk back. Try a longer window.`,
        }
      : { ok: false, reason: "routing_failed", message: routed.message };
  }

  // The stops that actually fit, already in route order: hotel -> stops -> hotel,
  // with any hotel activity pinned to an end. The hotel itself is never a stop.
  const { stops: finalStops, geometry, totalDurationSeconds } = routed;

  const persistResult = await d.persistItinerary({
    userId,
    hotelId: stay.hotel.id,
    hotelStayId: stay.id,
    dayNumber,
    existingDayId: existingDay?.id ?? null,
    routeGeoJson: geometry,
    // Mapbox returns fractional seconds (e.g. 448.9); itinerary_days.total_duration_seconds is an integer column.
    totalDurationSeconds: Math.round(totalDurationSeconds),
    availableMinutes,
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
      visitDurationMinutes: stop.visitDurationMinutes,
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
