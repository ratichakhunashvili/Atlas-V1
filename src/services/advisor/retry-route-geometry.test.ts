import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Hotel, ItineraryDay, ItineraryStop } from "@/db/schema";
import { retryRouteGeometryForUser, type RetryRouteGeometryDependencies } from "./retry-route-geometry";
import { makeTestPlace } from "./test-utils";

const NOW = new Date("2026-03-10T12:00:00Z");
const hotelPlace = makeTestPlace({ id: "hotel-place", category: "hotel", latitude: 41.7, longitude: 44.8 });
const hotel: Hotel = { id: "hotel-1", placeId: hotelPlace.id, qrToken: null, createdAt: NOW, updatedAt: NOW };

const GOOD_LINE = {
  type: "Feature" as const,
  properties: {},
  geometry: { type: "LineString" as const, coordinates: [[44.8, 41.7], [44.81, 41.71], [44.8, 41.7]] },
};

function day(routeGeoJson: unknown): ItineraryDay {
  return {
    id: "day-1",
    userId: "user-1",
    principalId: null,
    hotelId: hotel.id,
    hotelStayId: "stay-1",
    dayNumber: 1,
    stopCount: 2,
    routeGeoJson,
    totalDurationSeconds: 1000,
    originalDurationSeconds: 1000,
    availableMinutes: 120,
    generatedAt: NOW,
    completedAt: null,
  };
}

function stop(id: string, position: number): ItineraryStop {
  return {
    id,
    dayId: "day-1",
    placeId: `p-${id}`,
    isHotelStop: false,
    checkInMethod: "gps",
    name: id,
    category: "restaurant",
    latitude: 41.7 + position * 0.01,
    longitude: 44.8,
    imageUrl: null,
    visitDurationMinutes: 20,
    position,
    visitedAt: null,
    supersededAt: null,
    supersededReason: null,
  };
}

function setup(savedLine: unknown, route: { ok: boolean } = { ok: true }) {
  const calls = { routed: [] as Array<{ stops: unknown[] }>, saved: [] as Array<{ dayId: string; userId: string; routeGeoJson: unknown }> };
  const deps: RetryRouteGeometryDependencies = {
    findActiveStayForUser: async () => ({ id: "stay-1", checkIn: new Date("2026-03-10T08:00:00Z"), checkOut: null, hotel, place: hotelPlace }),
    findItineraryDay: async () => day(savedLine),
    listItineraryStops: async () => [stop("b", 1), stop("a", 0)], // deliberately unsorted
    getWalkingRouteInOrder: (async (input: { stops: unknown[] }) => {
      calls.routed.push({ stops: input.stops });
      return route.ok
        ? { ok: true, route: { geometry: GOOD_LINE, distanceMeters: 1, durationSeconds: 1 } }
        : { ok: false, reason: "network", message: "Could not reach Mapbox." };
    }) as RetryRouteGeometryDependencies["getWalkingRouteInOrder"],
    saveRouteGeometry: async (input) => {
      calls.saved.push(input);
      return true;
    },
  };
  return { calls, deps };
}

describe("retrying a missing route line", () => {
  it("re-routes the saved stops in their saved order and stores only the line", async () => {
    const { calls, deps } = setup(null);
    const result = await retryRouteGeometryForUser("user-1", NOW, deps);

    assert.deepEqual(result, { ok: true, status: "saved" });
    assert.deepEqual(calls.routed[0].stops, [
      { lat: 41.7, lng: 44.8 },
      { lat: 41.71, lng: 44.8 },
    ]);
    assert.deepEqual(calls.saved, [{ dayId: "day-1", userId: "user-1", routeGeoJson: GOOD_LINE }]);
  });

  it("makes no Mapbox request when the saved line is already valid", async () => {
    const { calls, deps } = setup(GOOD_LINE);
    assert.deepEqual(await retryRouteGeometryForUser("user-1", NOW, deps), { ok: true, status: "not_needed" });
    assert.equal(calls.routed.length, 0);
    assert.equal(calls.saved.length, 0);
  });

  it("saves nothing and reports the failure when routing fails", async () => {
    const { calls, deps } = setup({}, { ok: false });
    const result = await retryRouteGeometryForUser("user-1", NOW, deps);
    assert.equal(result.ok, false);
    assert.equal(calls.saved.length, 0, "a failed retry never writes a fabricated line");
  });

  it("refuses when there is no active stay or no generated plan", async () => {
    const { deps } = setup(null);
    assert.equal((await retryRouteGeometryForUser("user-1", NOW, { ...deps, findActiveStayForUser: async () => null })).ok, false);
    assert.equal((await retryRouteGeometryForUser("user-1", NOW, { ...deps, findItineraryDay: async () => null })).ok, false);
  });
});
