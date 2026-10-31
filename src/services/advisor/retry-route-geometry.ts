import type { Hotel, ItineraryDay, ItineraryStop, Place } from "@/db/schema";
import { getWalkingRouteInOrder, isValidRouteGeometry, type RoutingFailureReason } from "@/services/routing";
import { calculateDayNumber, stayEndFor } from "./stay-day";

export type RetryRouteGeometryResult =
  | { ok: true; status: "saved" | "not_needed" }
  | { ok: false; reason: "no_active_plan" | RoutingFailureReason; message: string };

type ActiveStayLike = { id: string; checkIn: Date; checkOut: Date | null; hotel: Hotel; place: Place };

export type RetryRouteGeometryDependencies = {
  findActiveStayForUser: (userId: string) => Promise<ActiveStayLike | null>;
  findItineraryDay: (userId: string, hotelId: string, dayNumber: number) => Promise<ItineraryDay | null>;
  listItineraryStops: (dayId: string) => Promise<ItineraryStop[]>;
  getWalkingRouteInOrder: typeof getWalkingRouteInOrder;
  /** Writes ONLY the geometry of a day the user owns. Never stops, order, durations or completion. */
  saveRouteGeometry: (input: { dayId: string; userId: string; routeGeoJson: unknown }) => Promise<boolean>;
};

async function loadDefaultDependencies(): Promise<RetryRouteGeometryDependencies> {
  const [staysQ, itineraryQ] = await Promise.all([import("@/db/queries/hotel-stays"), import("@/db/queries/itinerary")]);
  return {
    findActiveStayForUser: staysQ.findActiveStayForUser,
    findItineraryDay: itineraryQ.findItineraryDay,
    listItineraryStops: itineraryQ.listItineraryStops,
    getWalkingRouteInOrder,
    saveRouteGeometry: itineraryQ.saveRouteGeometry,
  };
}

/**
 * The guest's explicit "try drawing my route again" after the saved geometry was missing or unreadable.
 *
 * It re-routes the stops ALREADY in the plan, in their saved order, and stores only the line. It cannot add,
 * remove, reorder or re-pick a stop, and it takes no arguments from the browser: the day is the guest's own,
 * resolved here from their active stay. A day whose geometry is already valid is left alone ("not_needed") —
 * no second Mapbox request just to draw the same line.
 */
export async function retryRouteGeometryForUser(
  userId: string,
  now: Date = new Date(),
  deps?: RetryRouteGeometryDependencies
): Promise<RetryRouteGeometryResult> {
  const d = deps ?? (await loadDefaultDependencies());

  const stay = await d.findActiveStayForUser(userId);
  const dayNumber = stay ? calculateDayNumber(stay.checkIn, stayEndFor(stay), now) : null;
  if (!stay || !dayNumber || !dayNumber.ok) {
    return { ok: false, reason: "no_active_plan", message: "There is no active plan to draw." };
  }

  const day = await d.findItineraryDay(userId, stay.hotel.id, dayNumber.dayNumber);
  if (!day) {
    return { ok: false, reason: "no_active_plan", message: "There is no active plan to draw." };
  }

  if (isValidRouteGeometry(day.routeGeoJson) && day.routeGeoJson.geometry.coordinates.length >= 2) {
    return { ok: true, status: "not_needed" };
  }

  const stops = (await d.listItineraryStops(day.id)).slice().sort((a, b) => a.position - b.position);
  if (stops.length === 0) {
    return { ok: false, reason: "no_active_plan", message: "There is no active plan to draw." };
  }

  const routed = await d.getWalkingRouteInOrder({
    origin: { lat: stay.place.latitude, lng: stay.place.longitude },
    stops: stops.map((stop) => ({ lat: stop.latitude, lng: stop.longitude })),
    returnToOrigin: true,
  });
  if (!routed.ok) return { ok: false, reason: routed.reason, message: routed.message };

  const saved = await d.saveRouteGeometry({ dayId: day.id, userId, routeGeoJson: routed.route.geometry });
  if (!saved) return { ok: false, reason: "no_active_plan", message: "There is no active plan to draw." };

  return { ok: true, status: "saved" };
}
