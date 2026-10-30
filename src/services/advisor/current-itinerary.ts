import type { CheckInMethod, Hotel, ItineraryDay, ItineraryStop, Place, PlaceCategory } from "@/db/schema";
import { calculateDayNumber, stayEndFor } from "./stay-day";
import { firstUnvisitedStop } from "./check-in";
import { isCheckInMethodAllowed } from "./check-in-method";
import { isValidRouteGeometry, type RouteGeometry } from "@/services/routing";
import { estimateWalkMinutes, remainingBudgetMinutes, summarisePlanTime, type PlanTimeSummary } from "./time-budget";
import { savedStopVisitMinutes } from "./visit-duration";
import { summariseMissionSet, type MissionSetSummary } from "./mission-set";
import {
  evaluatePendingStops,
  isAvailable,
  loadDefaultAvailabilityContext,
  unavailableMessage,
  type AvailabilityContextLoader,
  type StopUnavailableReason,
} from "./stop-availability";

/** "unavailable": a PENDING stop whose partnership/facility is no longer eligible. Shown as such; never offered as the current stop. */
export type AdvisorStopStatus = "completed" | "current" | "upcoming" | "unavailable";

export type AdvisorStopView = {
  id: string;
  /** 0-based index within the ACTIVE plan (superseded history rows are not counted), so numbering on screen is always contiguous. */
  position: number;
  placeId: string | null;
  name: string;
  category: PlaceCategory | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  isHotelStop: boolean;
  checkInMethod: CheckInMethod;
  visitedAt: Date | null;
  /** How long this stop was expected to take. Null on plans made before the Advisor budgeted time. */
  visitDurationMinutes: number | null;
  /**
   * A straight-line walking ESTIMATE (with a detour allowance) from the previous stop — the hotel for
   * stop 1 — in whole minutes. An estimate, not a Mapbox leg time: the saved route stores one total.
   */
  walkMinutesFromPrevious: number;
  status: AdvisorStopStatus;
  /**
   * Whether the camera can be offered for this stop: it is the current stop, its
   * saved method allows an AR attempt, and its Place has a stored reference.
   *
   * Set only for the CURRENT stop, never for an upcoming one — the progressive
   * reveal rule applies to this as much as to names and coordinates, and knowing
   * which future Places have AR targets is knowing something about them. It is a
   * plain boolean by design: it says a camera MAY be offered, never anything
   * about what the camera must see.
   */
  canCheckInWithCamera: boolean;
  /** Only set when status is "unavailable". */
  unavailableReason: StopUnavailableReason | null;
  unavailableMessage: string | null;
};

export type CurrentItineraryState =
  | { status: "no_active_stay" }
  | { status: "no_itinerary_yet"; hotelName: string }
  | {
      status: "ready";
      dayId: string;
      dayNumber: number;
      stopCount: number;
      /** The round-trip Optimization estimate for the WHOLE route, not remaining time — label accordingly in the UI. */
      totalDurationSeconds: number | null;
      /**
       * The complete generated route (hotel -> every stop in order -> hotel), exactly as saved by the optimizer and
       * validated on read. Null when the saved value is missing or malformed — see routeStatus. Never refetched.
       */
      routeGeometry: RouteGeometry | null;
      /** "unavailable" means the guest sees the ordered stops and timings but no line, and should be told so. */
      routeStatus: "available" | "unavailable";
      /** The route's origin and return point. The hotel is never a stop. */
      hotel: { name: string; latitude: number; longitude: number };
      /** Estimated walk from the last stop back to the hotel, in whole minutes (the return buffer). */
      returnWalkMinutes: number;
      generatedAt: Date;
      completedAt: Date | null;
      stops: AdvisorStopView[];
      /** The server-derived first-unvisited stop — null once every stop (including the day) is complete. The UI must never let a user promote a later stop to "current" themselves. */
      currentStop: AdvisorStopView | null;
      /** True when at least one PENDING stop is no longer available. The guest may then explicitly update the plan; nothing changes on its own. */
      hasUnavailableStops: boolean;
      /** The first pending stop when it is unavailable: it blocks itself and every later stop (stop order is kept). Null otherwise. */
      blockedByUnavailableStop: { id: string; name: string } | null;
      /** The plan seen as missions: progress, and whether the set includes a hotel-owned activity (an incomplete set says why). */
      missions: MissionSetSummary;
      /** The window the guest asked for when this plan was made. Null for plans generated before windows existed. */
      availableMinutes: number | null;
      /**
       * Time and fit, kept as separate facts: how long is left, what the plan still
       * asks for, and whether that fits. An over-budget plan is REPORTED here — the
       * read model never trims a stop to make the numbers agree.
       */
      time: PlanTimeSummary;
    };

type ActiveStayLike = {
  id: string;
  checkIn: Date;
  checkOut: Date | null;
  hotel: Hotel;
  place: Place;
};

export type CurrentItineraryDependencies = {
  /** Same resolution generateItineraryForUser itself uses (db/queries/hotel-stays.ts's findActiveStayForUser, i.e. checkOut IS NULL) — this read-only lookup must agree with what generation would resolve, or "today's itinerary" could silently point at the wrong stay. */
  findActiveStayForUser: (userId: string) => Promise<ActiveStayLike | null>;
  findItineraryDay: (userId: string, hotelId: string, dayNumber: number) => Promise<ItineraryDay | null>;
  listItineraryStops: (dayId: string) => Promise<ItineraryStop[]>;
  /** Fresh eligibility context for the guest, used to flag unavailable pending stops. Read-only. */
  loadAvailabilityContext: AvailabilityContextLoader;
  /** Which of these Places have an AR reference stored. Returns presence only — never a hash. */
  findPlaceIdsWithArTargets: (placeIds: readonly string[]) => Promise<Set<string>>;
};

// Type-only imports only — same lazy-load pattern as every other services/*
// module in Atlas (db/queries/* starts with `import "server-only"`, which
// throws unconditionally outside Next's own bundler). See generate-itinerary.ts's
// loadDefaultDependencies for the full rationale.
async function loadDefaultDependencies(): Promise<CurrentItineraryDependencies> {
  const [hotelStaysQ, itineraryQ, arQ] = await Promise.all([
    import("@/db/queries/hotel-stays"),
    import("@/db/queries/itinerary"),
    import("@/db/queries/place-ar-targets"),
  ]);
  return {
    findActiveStayForUser: hotelStaysQ.findActiveStayForUser,
    findItineraryDay: itineraryQ.findItineraryDay,
    listItineraryStops: itineraryQ.listItineraryStops,
    loadAvailabilityContext: loadDefaultAvailabilityContext,
    findPlaceIdsWithArTargets: arQ.placeIdsWithArTargets,
  };
}

/**
 * Read-only: never generates, never mutates, never calls Mapbox. Resolves
 * exactly what generateItineraryForUser would resolve (active stay -> same
 * calendar-accurate dayNumber via calculateDayNumber) but only reads whatever
 * already exists, so a page can render "today's itinerary" without
 * accidentally triggering generation as a side effect of a GET request.
 * `currentStop` reuses check-in.ts's firstUnvisitedStop — the exact same
 * first-unvisited rule the real check-in services enforce — rather than a
 * second derivation that could silently drift from it.
 */
export async function getCurrentItineraryForUser(
  userId: string,
  now: Date = new Date(),
  deps?: CurrentItineraryDependencies
): Promise<CurrentItineraryState> {
  const d = deps ?? (await loadDefaultDependencies());

  const stay = await d.findActiveStayForUser(userId);
  if (!stay) {
    return { status: "no_active_stay" };
  }

  const dayNumberResult = calculateDayNumber(stay.checkIn, stayEndFor(stay), now);
  if (!dayNumberResult.ok) {
    return { status: "no_active_stay" };
  }

  const day = await d.findItineraryDay(userId, stay.hotel.id, dayNumberResult.dayNumber);
  if (!day) {
    return { status: "no_itinerary_yet", hotelName: stay.place.name };
  }

  const rawStops = (await d.listItineraryStops(day.id)).slice().sort((a, b) => a.position - b.position);
  const availabilityContext = await d.loadAvailabilityContext(userId, now);
  const availability = evaluatePendingStops(rawStops, day, availabilityContext);
  const firstPending = firstUnvisitedStop(rawStops);
  // The first pending stop is the only one that can be "current", and only while it is still available.
  const current = firstPending && isAvailable(availability.get(firstPending.id)) ? firstPending : null;

  /*
   * Asked ONLY about the current stop's Place. Passing the whole day's Place ids
   * would answer a question about stops the guest is not allowed to see yet, and
   * the answer would be sitting in the payload whether or not the UI rendered it.
   */
  const camerable =
    current?.placeId && isCheckInMethodAllowed(current.checkInMethod, "ar")
      ? await d.findPlaceIdsWithArTargets([current.placeId])
      : new Set<string>();

  const hotelPoint = { lat: stay.place.latitude, lng: stay.place.longitude };
  const stops: AdvisorStopView[] = rawStops.map((stop, index) => {
    const previous = index === 0 ? hotelPoint : { lat: rawStops[index - 1].latitude, lng: rawStops[index - 1].longitude };
    const availabilityOfStop = availability.get(stop.id);
    const unavailable = stop.visitedAt === null && availabilityOfStop !== undefined && !availabilityOfStop.available;
    return {
      id: stop.id,
      position: index,
      placeId: stop.placeId,
      name: stop.name,
      category: stop.category,
      latitude: stop.latitude,
      longitude: stop.longitude,
      imageUrl: stop.imageUrl,
      isHotelStop: stop.isHotelStop,
      visitDurationMinutes: stop.visitDurationMinutes,
      walkMinutesFromPrevious: Math.round(estimateWalkMinutes(previous, { lat: stop.latitude, lng: stop.longitude })),
      checkInMethod: stop.checkInMethod,
      canCheckInWithCamera: stop.placeId !== null && camerable.has(stop.placeId),
      visitedAt: stop.visitedAt,
      status: stop.visitedAt !== null ? "completed" : unavailable ? "unavailable" : current && stop.id === current.id ? "current" : "upcoming",
      unavailableReason: unavailable && !availabilityOfStop.available ? availabilityOfStop.reason : null,
      unavailableMessage: unavailable && !availabilityOfStop.available ? unavailableMessage(availabilityOfStop.reason) : null,
    };
  });

  const blockedByUnavailableStop =
    firstPending && !current ? { id: firstPending.id, name: firstPending.name } : null;

  /*
   * ROUTE PREVIEW. Once the guest has explicitly generated a plan, they are shown ALL of it: every stop, the saved
   * route line and the hotel it starts and ends at. This deliberately replaces the earlier progressive reveal.
   *
   * What stays on the server is AUTHORITY, not information: only the first pending stop is ever "current", so a
   * later stop can be seen and navigated toward but never checked in early, and the AR capability flag above is
   * still asked only about the current stop. Nothing here is reachable without the guest's own active stay and
   * their own day row — another guest's plan, or a day that was never generated, returns before this point.
   */
  const lastStop = rawStops.at(-1);
  const returnWalkMinutes = lastStop
    ? Math.round(estimateWalkMinutes({ lat: lastStop.latitude, lng: lastStop.longitude }, hotelPoint))
    : 0;
  const savedGeometry = day.routeGeoJson;
  const routeGeometry =
    isValidRouteGeometry(savedGeometry) && savedGeometry.geometry.coordinates.length >= 2 ? savedGeometry : null;

  return {
    status: "ready",
    dayId: day.id,
    dayNumber: day.dayNumber,
    stopCount: day.stopCount,
    totalDurationSeconds: day.totalDurationSeconds,
    routeGeometry,
    routeStatus: routeGeometry ? "available" : "unavailable",
    hotel: { name: stay.place.name, latitude: stay.place.latitude, longitude: stay.place.longitude },
    returnWalkMinutes,
    generatedAt: day.generatedAt,
    completedAt: day.completedAt,
    stops,
    currentStop: current ? (stops.find((s) => s.id === current.id) ?? null) : null,
    hasUnavailableStops: stops.some((stop) => stop.status === "unavailable"),
    blockedByUnavailableStop,
    missions: summariseMissionSet({
      stops: stops.map((stop) => ({ placeId: stop.placeId, visited: stop.visitedAt !== null })),
      eligibleFacilityPlaceIds: availabilityContext.facilityPlaceIds ?? new Set<string>(),
    }),
    availableMinutes: day.availableMinutes,
    // Only PENDING stops still cost the guest time; completed ones are already spent.
    time: summarisePlanTime({
      routeSeconds: day.totalDurationSeconds,
      pendingVisitMinutes: stops
        .filter((stop) => stop.visitedAt === null)
        .reduce((total, stop) => total + savedStopVisitMinutes(stop).minutes, 0),
      remainingMinutes: remainingBudgetMinutes({
        availableMinutes: day.availableMinutes,
        generatedAt: day.generatedAt,
        now,
      }),
    }),
  };
}
