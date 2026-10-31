import type { ItineraryDay, ItineraryStop } from "@/db/schema";
import type { LatLng } from "@/lib/geo";
import { getWalkingDirections, type DirectionsRoute, type RoutingFailureReason } from "@/services/routing";
import { evaluateStopAvailability, isAvailable, loadDefaultAvailabilityContext, type AvailabilityContextLoader } from "./stop-availability";

export type DirectionsToStopResult =
  | { ok: true; route: DirectionsRoute }
  | { ok: false; reason: RoutingFailureReason | "not_found" | "stop_unavailable"; message: string };

export type DirectionsToStopDependencies = {
  findItineraryStopWithDay: (stopId: string) => Promise<{ stop: ItineraryStop; day: ItineraryDay } | null>;
  loadAvailabilityContext: AvailabilityContextLoader;
  getWalkingDirections: typeof getWalkingDirections;
};

async function loadDefaultDependencies(): Promise<DirectionsToStopDependencies> {
  const itineraryQ = await import("@/db/queries/itinerary");
  return {
    findItineraryStopWithDay: itineraryQ.findItineraryStopWithDay,
    loadAvailabilityContext: loadDefaultAvailabilityContext,
    getWalkingDirections,
  };
}

/**
 * One Directions-API leg (the guest's current location -> one stop). The destination is ALWAYS resolved
 * server-side from the stop's own saved coordinates, and ownership is enforced from the stop's day; the
 * client supplies only its own current location. Directions to a PENDING stop that is no longer available
 * would be a recommendation of an ineligible place, so they are refused. Completed stops are history and
 * are not re-evaluated.
 */
export async function getDirectionsToStopForUser(
  input: { userId: string; stopId: string; origin: LatLng },
  now: Date = new Date(),
  deps?: DirectionsToStopDependencies
): Promise<DirectionsToStopResult> {
  const d = deps ?? (await loadDefaultDependencies());

  const found = await d.findItineraryStopWithDay(input.stopId);
  if (!found || found.day.userId !== input.userId) {
    return { ok: false, reason: "not_found", message: "Stop not found." };
  }

  if (found.stop.visitedAt === null) {
    const context = await d.loadAvailabilityContext(input.userId, now);
    if (!isAvailable(evaluateStopAvailability(found.stop, found.day, context))) {
      return { ok: false, reason: "stop_unavailable", message: "This stop is no longer available through your hotel." };
    }
  }

  return d.getWalkingDirections({
    origin: input.origin,
    destination: { lat: found.stop.latitude, lng: found.stop.longitude },
  });
}
