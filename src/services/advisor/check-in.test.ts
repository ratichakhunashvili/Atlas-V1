import { test } from "node:test";
import assert from "node:assert/strict";
import type { ItineraryDay, ItineraryStop } from "@/db/schema";
import { checkInStopWithGps, isValidCoordinate, CHECK_IN_RADIUS_METERS, type CheckInDependencies } from "./check-in";

let idCounter = 0;
function makeStop(overrides: Partial<ItineraryStop> = {}): ItineraryStop {
  idCounter += 1;
  return {
    id: `stop-${idCounter}`,
    dayId: "day-1",
    placeId: `place-${idCounter}`,
    isHotelStop: false,
    checkInMethod: "gps",
    name: `Stop ${idCounter}`,
    category: "restaurant",
    latitude: 41.7151,
    longitude: 44.8271,
    imageUrl: null,
    position: idCounter,
    visitedAt: null,
    ...overrides,
  };
}

function makeDay(overrides: Partial<ItineraryDay> = {}): ItineraryDay {
  return {
    id: "day-1",
    userId: "user-1",
    hotelId: "hotel-1",
    hotelStayId: "stay-1",
    dayNumber: 1,
    stopCount: 3,
    routeGeoJson: null,
    totalDurationSeconds: null,
    generatedAt: new Date("2026-03-10T08:00:00Z"),
    completedAt: null,
    ...overrides,
  };
}

/** An in-memory stand-in for db/queries/itinerary.ts's stop/day functions, including markStopVisited's "conditional update" contract (returns null if already visited). */
function createFakeStore(day: ItineraryDay, initialStops: ItineraryStop[]) {
  let stops = initialStops;
  let completedAt: Date | null = day.completedAt;

  const findItineraryStopWithDay: CheckInDependencies["findItineraryStopWithDay"] = async (stopId) => {
    const stop = stops.find((s) => s.id === stopId);
    if (!stop) return null;
    return { stop, day: { ...day, completedAt } };
  };

  const listItineraryStops: CheckInDependencies["listItineraryStops"] = async () =>
    [...stops].sort((a, b) => a.position - b.position);

  const markStopVisited: CheckInDependencies["markStopVisited"] = async (stopId, _dayId, checkInMethod) => {
    const target = stops.find((s) => s.id === stopId);
    if (!target || target.visitedAt !== null) return null; // already visited — the conditional-update guard
    const visited: ItineraryStop = { ...target, visitedAt: new Date(), checkInMethod };
    stops = stops.map((s) => (s.id === stopId ? visited : s));
    const dayCompleted = stops.every((s) => s.visitedAt !== null);
    if (dayCompleted) completedAt = new Date();
    return { stop: visited, dayCompleted };
  };

  return {
    deps: { findItineraryStopWithDay, listItineraryStops, markStopVisited },
    getStops: () => stops,
    getCompletedAt: () => completedAt,
  };
}

const NEAR = { latitude: 41.7151, longitude: 44.8271 }; // same as makeStop's default coordinates
const FAR = { latitude: 41.9, longitude: 45.1 }; // many km away

test("isValidCoordinate", async (t) => {
  await t.test("accepts a valid coordinate", () => {
    assert.equal(isValidCoordinate({ lat: 41.7, lng: 44.8 }), true);
  });
  await t.test("rejects out-of-range latitude", () => {
    assert.equal(isValidCoordinate({ lat: 91, lng: 0 }), false);
    assert.equal(isValidCoordinate({ lat: -91, lng: 0 }), false);
  });
  await t.test("rejects out-of-range longitude", () => {
    assert.equal(isValidCoordinate({ lat: 0, lng: 181 }), false);
    assert.equal(isValidCoordinate({ lat: 0, lng: -181 }), false);
  });
  await t.test("rejects NaN", () => {
    assert.equal(isValidCoordinate({ lat: NaN, lng: 0 }), false);
  });
  await t.test("rejects Infinity", () => {
    assert.equal(isValidCoordinate({ lat: Infinity, lng: 0 }), false);
    assert.equal(isValidCoordinate({ lat: 0, lng: -Infinity }), false);
  });
});

test("rejects a stop that does not exist", async () => {
  const store = createFakeStore(makeDay(), []);
  const result = await checkInStopWithGps({ userId: "user-1", stopId: "nope", ...NEAR }, store.deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "not_found");
});

test("rejects a stop belonging to a different user, without revealing details", async () => {
  const stop1 = makeStop({ position: 0 });
  const store = createFakeStore(makeDay({ userId: "user-1" }), [stop1]);
  const result = await checkInStopWithGps({ userId: "someone-else", stopId: stop1.id, ...NEAR }, store.deps);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "not_found");
    assert.equal(result.message, "Stop not found.");
  }
});

test("accepts the first unvisited stop within range", async () => {
  const stop1 = makeStop({ position: 0 });
  const stop2 = makeStop({ position: 1 });
  const store = createFakeStore(makeDay(), [stop1, stop2]);
  const result = await checkInStopWithGps({ userId: "user-1", stopId: stop1.id, ...NEAR }, store.deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.notEqual(result.stop.visitedAt, null);
    assert.equal(result.stop.checkInMethod, "gps");
    assert.equal(result.nextStop?.id, stop2.id);
    assert.equal(result.dayCompleted, false);
    assert.equal(result.alreadyVisited, false);
  }
});

test("rejects checking in a later stop while an earlier one is still unvisited", async () => {
  const stop1 = makeStop({ position: 0 });
  const stop2 = makeStop({ position: 1 });
  const store = createFakeStore(makeDay(), [stop1, stop2]);
  const result = await checkInStopWithGps({ userId: "user-1", stopId: stop2.id, ...NEAR }, store.deps);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "stop_not_next");
    assert.equal(result.nextStop?.id, stop1.id);
  }
  assert.equal(store.getStops().find((s) => s.id === stop2.id)?.visitedAt, null, "stop 2 must remain unvisited");
});

test("an already-visited stop returns an idempotent success, without a second write", async () => {
  const visitedAt = new Date("2026-03-10T09:00:00Z");
  const stop1 = makeStop({ position: 0, visitedAt, checkInMethod: "gps" });
  const stop2 = makeStop({ position: 1 });
  const store = createFakeStore(makeDay(), [stop1, stop2]);
  const result = await checkInStopWithGps({ userId: "user-1", stopId: stop1.id, ...NEAR }, store.deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.alreadyVisited, true);
    assert.equal(result.stop.visitedAt?.getTime(), visitedAt.getTime(), "visitedAt must not be overwritten");
  }
});

test("invalid coordinates are rejected before any distance check", async () => {
  const stop1 = makeStop({ position: 0 });
  const store = createFakeStore(makeDay(), [stop1]);
  const result = await checkInStopWithGps({ userId: "user-1", stopId: stop1.id, latitude: NaN, longitude: 44.8 }, store.deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "invalid_coordinates");
});

test("exactly 150m is accepted (boundary is inclusive)", async () => {
  // 150m north of the stop: ~0.00134869 degrees latitude per 150m (111320 m/deg).
  const stop1 = makeStop({ position: 0, latitude: 41.7151, longitude: 44.8271 });
  const store = createFakeStore(makeDay(), [stop1]);
  const offsetLat = 41.7151 + 150 / 111320;
  const result = await checkInStopWithGps(
    { userId: "user-1", stopId: stop1.id, latitude: offsetLat, longitude: 44.8271 },
    store.deps
  );
  assert.equal(result.ok, true, JSON.stringify(result));
});

test("just over 150m is rejected", async () => {
  const stop1 = makeStop({ position: 0, latitude: 41.7151, longitude: 44.8271 });
  const store = createFakeStore(makeDay(), [stop1]);
  const offsetLat = 41.7151 + 200 / 111320;
  const result = await checkInStopWithGps(
    { userId: "user-1", stopId: stop1.id, latitude: offsetLat, longitude: 44.8271 },
    store.deps
  );
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "out_of_range");
    assert.equal(result.requiredRadiusMeters, CHECK_IN_RADIUS_METERS);
    assert.ok(result.distanceMeters !== undefined && result.distanceMeters > 150);
  }
  assert.equal(store.getStops()[0].visitedAt, null, "must not mark visited when out of range");
});

test("well within 150m is accepted", async () => {
  const stop1 = makeStop({ position: 0, latitude: 41.7151, longitude: 44.8271 });
  const store = createFakeStore(makeDay(), [stop1]);
  const result = await checkInStopWithGps(
    { userId: "user-1", stopId: stop1.id, latitude: 41.7152, longitude: 44.8271 },
    store.deps
  );
  assert.equal(result.ok, true);
});

test("far away (FAR fixture) is rejected", async () => {
  const stop1 = makeStop({ position: 0 });
  const store = createFakeStore(makeDay(), [stop1]);
  const result = await checkInStopWithGps({ userId: "user-1", stopId: stop1.id, ...FAR }, store.deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "out_of_range");
});

test("checking in the final stop completes the day", async () => {
  const stop1 = makeStop({ position: 0, visitedAt: new Date(), checkInMethod: "gps" });
  const stop2 = makeStop({ position: 1 }); // the last unvisited stop
  const store = createFakeStore(makeDay(), [stop1, stop2]);
  const result = await checkInStopWithGps({ userId: "user-1", stopId: stop2.id, ...NEAR }, store.deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.dayCompleted, true);
    assert.equal(result.nextStop, null);
  }
  assert.notEqual(store.getCompletedAt(), null);
});

test("checking in a non-final stop leaves the day incomplete", async () => {
  const stop1 = makeStop({ position: 0 });
  const stop2 = makeStop({ position: 1 });
  const store = createFakeStore(makeDay(), [stop1, stop2]);
  await checkInStopWithGps({ userId: "user-1", stopId: stop1.id, ...NEAR }, store.deps);
  assert.equal(store.getCompletedAt(), null);
});

test("an already-auto-visited hotel filler never blocks GPS progression", async () => {
  const filler = makeStop({ position: 0, isHotelStop: true, checkInMethod: "auto", visitedAt: new Date() });
  const firstReal = makeStop({ position: 1 });
  const store = createFakeStore(makeDay(), [filler, firstReal]);
  const result = await checkInStopWithGps({ userId: "user-1", stopId: firstReal.id, ...NEAR }, store.deps);
  assert.equal(result.ok, true, JSON.stringify(result));
});

test("concurrency: two simultaneous requests for the same stop result in exactly one real transition", async () => {
  const stop1 = makeStop({ position: 0 });
  const store = createFakeStore(makeDay(), [stop1]);

  const [a, b] = await Promise.all([
    checkInStopWithGps({ userId: "user-1", stopId: stop1.id, ...NEAR }, store.deps),
    checkInStopWithGps({ userId: "user-1", stopId: stop1.id, ...NEAR }, store.deps),
  ]);

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  const alreadyVisitedFlags = [a, b].map((r) => (r.ok ? r.alreadyVisited : null));
  assert.deepEqual([...alreadyVisitedFlags].sort(), [false, true], "exactly one request performs the real transition");
  assert.equal(store.getStops()[0].visitedAt !== null, true);
});
