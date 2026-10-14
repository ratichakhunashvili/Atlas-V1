import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { ItineraryDay, ItineraryStop } from "@/db/schema";
import { getCurrentItineraryForUser, type CurrentItineraryDependencies } from "./current-itinerary";
import { contextFromEligible } from "./stop-availability";
import { makeTestPlace } from "./test-utils";

const NOW = new Date("2026-06-15T12:00:00Z");
const USER = "00000000-0000-4000-8000-000000000001";
const STAY = "00000000-0000-4000-8000-0000000000a1";
const HOTEL = "00000000-0000-4000-8000-0000000000b1";
const DAY = "00000000-0000-4000-8000-0000000000c1";
const [P1, P2, P3, P4] = [1, 2, 3, 4].map((n) => `00000000-0000-4000-8000-0000000000d${n}`);
const [S1, S2, S3, S4] = [1, 2, 3, 4].map((n) => `00000000-0000-4000-8000-0000000000e${n}`);

const day: ItineraryDay = {
  id: DAY,
  userId: USER,
  hotelId: HOTEL,
  hotelStayId: STAY,
  dayNumber: 1,
  stopCount: 4,
  routeGeoJson: null,
  totalDurationSeconds: 3600,
  originalDurationSeconds: 3600,
  generatedAt: new Date("2026-06-15T08:00:00Z"),
  completedAt: null,
};

const stop = (id: string, placeId: string, position: number, overrides: Partial<ItineraryStop> = {}): ItineraryStop => ({
  id,
  dayId: DAY,
  placeId,
  isHotelStop: false,
  checkInMethod: "gps",
  name: `Stop ${position + 1}`,
  category: "restaurant",
  latitude: 41.7,
  longitude: 44.8,
  imageUrl: null,
  position,
  visitedAt: null,
  supersededAt: null,
  supersededReason: null,
  ...overrides,
});

function deps(stops: ItineraryStop[], eligible: string[], counters = { reads: 0, loads: 0 }): CurrentItineraryDependencies {
  const hotelPlace = makeTestPlace({ id: "00000000-0000-4000-8000-0000000000aa", category: "hotel", name: "Hotel" });
  return {
    findActiveStayForUser: async () => ({
      id: STAY,
      checkIn: new Date("2026-06-15T08:00:00Z"),
      checkOut: null,
      hotel: { id: HOTEL, placeId: hotelPlace.id, qrToken: "x", createdAt: NOW, updatedAt: NOW },
      place: hotelPlace,
    }),
    findItineraryDay: async () => {
      counters.reads += 1;
      return day;
    },
    // The real query returns the ACTIVE plan only; the fake mirrors that.
    listItineraryStops: async () => stops.filter((s) => s.supersededAt === null),
    loadAvailabilityContext: async () => {
      counters.loads += 1;
      return contextFromEligible({ id: STAY, hotel: { id: HOTEL }, checkIn: new Date("2026-06-15T08:00:00Z"), checkOut: null }, eligible.map((id) => ({ place: { id } as never })), NOW);
    },
  };
}

async function ready(stops: ItineraryStop[], eligible: string[]) {
  const result = await getCurrentItineraryForUser(USER, NOW, deps(stops, eligible));
  assert.equal(result.status, "ready");
  if (result.status !== "ready") throw new Error("unreachable");
  return result;
}

describe("read model: unavailable pending stops", () => {
  test("everything eligible: no unavailable stops, the first pending stop is current, nothing is blocked", async () => {
    const result = await ready([stop(S1, P1, 0), stop(S2, P2, 1)], [P1, P2]);
    assert.equal(result.hasUnavailableStops, false);
    assert.equal(result.blockedByUnavailableStop, null);
    assert.equal(result.currentStop?.id, S1);
  });

  test("an unavailable pending stop is shown as 'unavailable' with a reason, and is NEVER offered as the current stop", async () => {
    const result = await ready([stop(S1, P1, 0), stop(S2, P2, 1)], [P2]); // P1 no longer eligible
    const first = result.stops.find((s) => s.id === S1);
    assert.equal(first?.status, "unavailable");
    assert.equal(first?.unavailableReason, "not_eligible");
    assert.ok(first?.unavailableMessage);
    assert.equal(result.currentStop, null);
    assert.equal(result.hasUnavailableStops, true);
    assert.deepEqual(result.blockedByUnavailableStop, { id: S1, name: "Stop 1" });
    // The later (available) stop is just upcoming/on hold — never promoted to current.
    assert.equal(result.stops.find((s) => s.id === S2)?.status, "upcoming");
  });

  test("an EARLIER available stop remains current while a LATER stop is unavailable", async () => {
    const result = await ready([stop(S1, P1, 0), stop(S2, P2, 1), stop(S3, P3, 2)], [P1, P3]); // P2 unavailable
    assert.equal(result.currentStop?.id, S1);
    assert.equal(result.stops.find((s) => s.id === S2)?.status, "unavailable");
    assert.equal(result.hasUnavailableStops, true);
    assert.equal(result.blockedByUnavailableStop, null, "S1 is still checkable, so nothing is blocking yet");
  });

  test("completed stops are never flagged, even if their Place is no longer eligible", async () => {
    const done = stop(S1, P1, 0, { visitedAt: new Date("2026-06-15T09:00:00Z") });
    const result = await ready([done, stop(S2, P2, 1)], [P2]); // P1 ineligible but completed
    assert.equal(result.stops.find((s) => s.id === S1)?.status, "completed");
    assert.equal(result.stops.find((s) => s.id === S1)?.unavailableReason, null);
    assert.equal(result.currentStop?.id, S2);
    assert.equal(result.hasUnavailableStops, false);
  });

  test("superseded (history) stops are not part of the plan, and numbering stays contiguous", async () => {
    const superseded = stop(S2, P2, 1, { supersededAt: NOW, supersededReason: "removed_unavailable" });
    const result = await ready([stop(S1, P1, 0), superseded, stop(S3, P3, 2), stop(S4, P4, 3)], [P1, P3, P4]);
    assert.deepEqual(result.stops.map((s) => s.id), [S1, S3, S4]);
    assert.deepEqual(result.stops.map((s) => s.position), [0, 1, 2], "positions are the index in the active plan");
  });

  test("the read model is read-only and evaluates availability exactly once per request", async () => {
    const counters = { reads: 0, loads: 0 };
    const result = await getCurrentItineraryForUser(USER, NOW, deps([stop(S1, P1, 0), stop(S2, P2, 1)], [P2], counters));
    assert.equal(result.status, "ready");
    assert.equal(counters.loads, 1);
    assert.equal(counters.reads, 1, "it only reads: no regeneration or repair happens by loading the plan");
  });

  test("an unavailable stop does not change the route or the stops themselves: only flags are added", async () => {
    const before = [stop(S1, P1, 0), stop(S2, P2, 1)];
    const snapshot = JSON.stringify(before);
    await ready(before, []);
    assert.equal(JSON.stringify(before), snapshot, "the input stops are untouched");
  });
});

describe("read model: displayed duration", () => {
  test("shows the ACTIVE route's duration, not the original estimate (they differ after a repair)", async () => {
    const repairedDay: ItineraryDay = { ...day, totalDurationSeconds: 1200, originalDurationSeconds: 7200 };
    const base = deps([stop(S1, P1, 0)], [P1]);
    const result = await getCurrentItineraryForUser(USER, NOW, { ...base, findItineraryDay: async () => repairedDay });
    assert.equal(result.status, "ready");
    if (result.status === "ready") assert.equal(result.totalDurationSeconds, 1200);
  });

  test("a day with no active route (duration cleared) shows no duration rather than a stale one", async () => {
    const clearedDay: ItineraryDay = { ...day, totalDurationSeconds: null, originalDurationSeconds: 7200 };
    const base = deps([stop(S1, P1, 0, { visitedAt: NOW })], [P1]);
    const result = await getCurrentItineraryForUser(USER, NOW, { ...base, findItineraryDay: async () => clearedDay });
    assert.equal(result.status, "ready");
    if (result.status === "ready") assert.equal(result.totalDurationSeconds, null);
  });
});
