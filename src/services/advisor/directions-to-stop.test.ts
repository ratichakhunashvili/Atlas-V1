import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { ItineraryDay, ItineraryStop } from "@/db/schema";
import { getDirectionsToStopForUser, type DirectionsToStopDependencies } from "./directions-to-stop";
import { contextFromEligible } from "./stop-availability";

const NOW = new Date("2026-06-15T12:00:00Z");
const USER = "00000000-0000-4000-8000-000000000001";
const OTHER_USER = "00000000-0000-4000-8000-000000000002";
const STAY = "00000000-0000-4000-8000-0000000000a1";
const HOTEL = "00000000-0000-4000-8000-0000000000b1";
const DAY = "00000000-0000-4000-8000-0000000000c1";
const PLACE = "00000000-0000-4000-8000-0000000000d1";
const STOP = "00000000-0000-4000-8000-0000000000e1";
const ORIGIN = { lat: 41.71, lng: 44.81 };

const day: ItineraryDay = {
  id: DAY,
  userId: USER,
  hotelId: HOTEL,
  hotelStayId: STAY,
  dayNumber: 1,
  stopCount: 1,
  routeGeoJson: null,
  totalDurationSeconds: null,
  originalDurationSeconds: null,
  generatedAt: new Date("2026-06-15T08:00:00Z"),
  completedAt: null,
};

const stop = (overrides: Partial<ItineraryStop> = {}): ItineraryStop => ({
  id: STOP,
  dayId: DAY,
  placeId: PLACE,
  isHotelStop: false,
  checkInMethod: "gps",
  name: "Saved stop",
  category: "restaurant",
  latitude: 41.7,
  longitude: 44.8,
  imageUrl: null,
  position: 0,
  visitedAt: null,
  supersededAt: null,
  supersededReason: null,
  ...overrides,
});

function build(stopRow: ItineraryStop | null, eligible: string[]) {
  const calls = { directions: [] as Array<{ origin: unknown; destination: unknown }>, loads: 0 };
  const deps: DirectionsToStopDependencies = {
    findItineraryStopWithDay: async (id) => (stopRow && stopRow.id === id && stopRow.supersededAt === null ? { stop: stopRow, day } : null),
    loadAvailabilityContext: async () => {
      calls.loads += 1;
      return contextFromEligible({ id: STAY, hotel: { id: HOTEL }, checkIn: new Date("2026-06-15T08:00:00Z"), checkOut: null }, eligible.map((id) => ({ place: { id } as never })), NOW);
    },
    getWalkingDirections: async (input) => {
      calls.directions.push(input);
      return { ok: true, route: { geometry: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } }, distanceMeters: 100, durationSeconds: 60 } };
    },
  };
  return { deps, calls };
}

describe("directions to a stop", () => {
  test("an available pending stop gets directions to ITS OWN saved coordinates (the client supplies only its location)", async () => {
    const { deps, calls } = build(stop(), [PLACE]);
    const result = await getDirectionsToStopForUser({ userId: USER, stopId: STOP, origin: ORIGIN }, NOW, deps);
    assert.equal(result.ok, true);
    assert.deepEqual(calls.directions, [{ origin: ORIGIN, destination: { lat: 41.7, lng: 44.8 } }]);
  });

  test("a pending stop that is no longer available is refused, and no directions request is made", async () => {
    const { deps, calls } = build(stop(), []);
    const result = await getDirectionsToStopForUser({ userId: USER, stopId: STOP, origin: ORIGIN }, NOW, deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "stop_unavailable");
    assert.deepEqual(calls.directions, []);
  });

  test("a completed stop is history and is not re-evaluated", async () => {
    const { deps, calls } = build(stop({ visitedAt: new Date("2026-06-15T09:00:00Z") }), []);
    const result = await getDirectionsToStopForUser({ userId: USER, stopId: STOP, origin: ORIGIN }, NOW, deps);
    assert.equal(result.ok, true);
    assert.equal(calls.loads, 0);
  });

  test("another guest's stop is 'not found' and nothing is evaluated or requested", async () => {
    const { deps, calls } = build(stop(), [PLACE]);
    const result = await getDirectionsToStopForUser({ userId: OTHER_USER, stopId: STOP, origin: ORIGIN }, NOW, deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_found");
    assert.equal(calls.loads, 0);
    assert.deepEqual(calls.directions, []);
  });

  test("a superseded stop is 'not found'", async () => {
    const { deps } = build(stop({ supersededAt: NOW, supersededReason: "stop_unavailable" }), [PLACE]);
    const result = await getDirectionsToStopForUser({ userId: USER, stopId: STOP, origin: ORIGIN }, NOW, deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_found");
  });
});
