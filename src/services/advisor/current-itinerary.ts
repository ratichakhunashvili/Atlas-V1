import type { CheckInMethod, Hotel, ItineraryDay, ItineraryStop, Place, PlaceCategory } from "@/db/schema";
import { calculateDayNumber } from "./stay-day";
import { firstUnvisitedStop } from "./check-in";
import { isValidRouteGeometry, type RouteGeometry } from "@/services/routing";

export type AdvisorStopStatus = "completed" | "current" | "upcoming";

export type AdvisorStopView = {
  id: string;
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
  status: AdvisorStopStatus;
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
      routeGeometry: RouteGeometry | null;
      generatedAt: Date;
      completedAt: Date | null;
      stops: AdvisorStopView[];
      /** The server-derived first-unvisited stop — null once every stop (including the day) is complete. The UI must never let a user promote a later stop to "current" themselves. */
      currentStop: AdvisorStopView | null;
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
};

// Type-only imports only — same lazy-load pattern as every other services/*
// module in Atlas (db/queries/* starts with `import "server-only"`, which
// throws unconditionally outside Next's own bundler). See generate-itinerary.ts's
// loadDefaultDependencies for the full rationale.
async function loadDefaultDependencies(): Promise<CurrentItineraryDependencies> {
  const [hotelStaysQ, itineraryQ] = await Promise.all([import("@/db/queries/hotel-stays"), import("@/db/queries/itinerary")]);
  return {
    findActiveStayForUser: hotelStaysQ.findActiveStayForUser,
    findItineraryDay: itineraryQ.findItineraryDay,
    listItineraryStops: itineraryQ.listItineraryStops,
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

  const dayNumberResult = calculateDayNumber(stay.checkIn, stay.checkOut, now);
  if (!dayNumberResult.ok) {
    return { status: "no_active_stay" };
  }

  const day = await d.findItineraryDay(userId, stay.hotel.id, dayNumberResult.dayNumber);
  if (!day) {
    return { status: "no_itinerary_yet", hotelName: stay.place.name };
  }

  const rawStops = await d.listItineraryStops(day.id);
  const current = firstUnvisitedStop(rawStops);

  const stops: AdvisorStopView[] = rawStops
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((stop) => ({
      id: stop.id,
      position: stop.position,
      placeId: stop.placeId,
      name: stop.name,
      category: stop.category,
      latitude: stop.latitude,
      longitude: stop.longitude,
      imageUrl: stop.imageUrl,
      isHotelStop: stop.isHotelStop,
      checkInMethod: stop.checkInMethod,
      visitedAt: stop.visitedAt,
      status: stop.visitedAt !== null ? "completed" : current && stop.id === current.id ? "current" : "upcoming",
    }));

  return {
    status: "ready",
    dayId: day.id,
    dayNumber: day.dayNumber,
    stopCount: day.stopCount,
    totalDurationSeconds: day.totalDurationSeconds,
    routeGeometry: isValidRouteGeometry(day.routeGeoJson) ? day.routeGeoJson : null,
    generatedAt: day.generatedAt,
    completedAt: day.completedAt,
    stops,
    currentStop: current ? (stops.find((s) => s.id === current.id) ?? null) : null,
  };
}
