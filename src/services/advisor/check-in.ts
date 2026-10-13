import { distanceMeters, type LatLng } from "@/lib/geo";
import type { CheckInMethod, ItineraryDay, ItineraryStop } from "@/db/schema";

/** Exact radius as Map Advisor Functional's CHECKIN_RADIUS_METERS — never increase this, never make it client-configurable. */
export const CHECK_IN_RADIUS_METERS = 150;

export type CheckInFailureReason = "not_found" | "invalid_coordinates" | "stop_not_next" | "out_of_range";

export type CheckInResult =
  | {
      ok: true;
      stop: ItineraryStop;
      nextStop: ItineraryStop | null;
      dayCompleted: boolean;
      /** True when the stop was already visited before this call — no DB write happened, reported idempotently rather than as an error. */
      alreadyVisited: boolean;
    }
  | {
      ok: false;
      reason: CheckInFailureReason;
      message: string;
      distanceMeters?: number;
      requiredRadiusMeters?: number;
      nextStop?: { id: string; name: string };
    };

export type CheckInDependencies = {
  findItineraryStopWithDay: (stopId: string) => Promise<{ stop: ItineraryStop; day: ItineraryDay } | null>;
  listItineraryStops: (dayId: string) => Promise<ItineraryStop[]>;
  markStopVisited: (stopId: string, dayId: string, checkInMethod: CheckInMethod) => Promise<{ stop: ItineraryStop; dayCompleted: boolean } | null>;
};

// Type-only import, lazily resolved below — same reason as every other
// services/* boundary in Atlas that needs its real deps to stay out of a
// plain `node --test` run: db/queries/itinerary.ts starts with
// `import "server-only"`, which throws unconditionally outside Next's own
// bundler. See services/routing/index.ts's resolveAccessToken and
// services/advisor/generate-itinerary.ts's loadDefaultDependencies for the
// same pattern.
async function loadDefaultDependencies(): Promise<CheckInDependencies> {
  const itineraryQ = await import("@/db/queries/itinerary");
  return {
    findItineraryStopWithDay: itineraryQ.findItineraryStopWithDay,
    listItineraryStops: itineraryQ.listItineraryStops,
    markStopVisited: itineraryQ.markStopVisited,
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
  input: { userId: string; stopId: string; latitude: number; longitude: number },
  deps?: CheckInDependencies
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
  if (!required || required.id !== stop.id) {
    return {
      ok: false,
      reason: "stop_not_next",
      message: "Check in your stops in order — this isn't your next stop yet.",
      nextStop: required ? { id: required.id, name: required.name } : undefined,
    };
  }

  if (!isValidCoordinate({ lat: input.latitude, lng: input.longitude })) {
    return { ok: false, reason: "invalid_coordinates", message: "Invalid GPS coordinates." };
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

  const updated = await d.markStopVisited(stop.id, day.id, "gps");
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

  const freshStops = await d.listItineraryStops(day.id);
  return {
    ok: true,
    stop: updated.stop,
    nextStop: firstUnvisitedStop(freshStops),
    dayCompleted: updated.dayCompleted,
    alreadyVisited: false,
  };
}
