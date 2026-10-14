import { test } from "node:test";
import assert from "node:assert/strict";
import type { Hotel, ItineraryDay, ItineraryStop, Place } from "@/db/schema";
import { loadAllAvailable, makeTestPlace } from "./test-utils";
import { checkInStopWithQr, type QrCheckInDependencies } from "./check-in-qr";

// Same calendar date as every fixture's checkIn below -> dayNumber resolves to 1.
const NOW = new Date("2026-03-10T09:00:00Z");

let idCounter = 0;
function makeStop(overrides: Partial<ItineraryStop> = {}): ItineraryStop {
  idCounter += 1;
  return {
    id: `stop-${idCounter}`,
    dayId: "day-1",
    placeId: `place-${idCounter}`,
    isHotelStop: false,
    checkInMethod: "qr",
    name: `Stop ${idCounter}`,
    category: "restaurant",
    latitude: 41.7151,
    longitude: 44.8271,
    imageUrl: null,
    position: idCounter,
    visitedAt: null,
    supersededAt: null,
    supersededReason: null,
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
    stopCount: 2,
    routeGeoJson: null,
    totalDurationSeconds: null,
    originalDurationSeconds: null,
    generatedAt: new Date("2026-03-10T08:00:00Z"),
    completedAt: null,
    ...overrides,
  };
}

function makeHotel(placeId: string, id = "hotel-1"): Hotel {
  return {
    id,
    placeId,
    qrToken: "hotel-qr-token",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

/** In-memory stand-in for db/queries/places.ts + hotel-stays.ts + itinerary.ts, scoped to one user/day for most tests, with markStopVisited's conditional-update contract reused verbatim from check-in.test.ts's fake. */
function createFakeDeps(options: {
  places?: Place[];
  userId?: string;
  hotelId?: string;
  day?: ItineraryDay | null;
  stops?: ItineraryStop[];
  noActiveStay?: boolean;
}): { deps: QrCheckInDependencies; getStops: () => ItineraryStop[]; getCompletedAt: () => Date | null } {
  const userId = options.userId ?? "user-1";
  const hotelId = options.hotelId ?? "hotel-1";
  const places = options.places ?? [];
  let stops = options.stops ?? [];
  const day = options.day === undefined ? makeDay({ userId, hotelId }) : options.day;
  let completedAt: Date | null = day?.completedAt ?? null;
  const hotelPlace = makeTestPlace({ id: `${hotelId}-place`, category: "hotel" });
  const hotel = makeHotel(hotelPlace.id);

  const findPlaceByQrToken: QrCheckInDependencies["findPlaceByQrToken"] = async (qrToken) =>
    places.find((p) => p.qrToken === qrToken) ?? null;

  const findActiveStayForUser: QrCheckInDependencies["findActiveStayForUser"] = async (uid) =>
    options.noActiveStay || uid !== userId
      ? null
      : { id: "stay-1", checkIn: new Date("2026-03-10T08:00:00Z"), checkOut: null, hotel, place: hotelPlace };

  const findItineraryDay: QrCheckInDependencies["findItineraryDay"] = async (uid, hid, dayNumber) =>
    uid === userId && hid === hotelId && day && day.dayNumber === dayNumber ? { ...day, completedAt } : null;

  const listItineraryStops: QrCheckInDependencies["listItineraryStops"] = async () =>
    [...stops].sort((a, b) => a.position - b.position);

  const markStopVisited: QrCheckInDependencies["markStopVisited"] = async (stopId, _dayId, checkInMethod) => {
    const target = stops.find((s) => s.id === stopId);
    if (!target || target.visitedAt !== null) return null;
    const visited: ItineraryStop = { ...target, visitedAt: new Date(), checkInMethod };
    stops = stops.map((s) => (s.id === stopId ? visited : s));
    const dayCompleted = stops.every((s) => s.visitedAt !== null);
    if (dayCompleted) completedAt = new Date();
    return { stop: visited, dayCompleted };
  };

  return {
    deps: { findPlaceByQrToken, findActiveStayForUser, findItineraryDay, listItineraryStops, markStopVisited, loadAvailabilityContext: loadAllAvailable },
    getStops: () => stops,
    getCompletedAt: () => completedAt,
  };
}

test("an empty QR token is rejected as invalid", async () => {
  const { deps } = createFakeDeps({});
  const result = await checkInStopWithQr({ userId: "user-1", qrToken: "   " }, NOW, deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "invalid_qr");
});

test("a token that resolves to no Place is rejected as invalid, without exposing details", async () => {
  const { deps } = createFakeDeps({});
  const result = await checkInStopWithQr({ userId: "user-1", qrToken: "bogus-token" }, NOW, deps);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "invalid_qr");
    assert.equal(result.message, "Invalid QR code.");
  }
});

test("a token resolves to the correct Place and completes the matching first-unvisited stop", async () => {
  const placeA = makeTestPlace({ category: "restaurant", qrToken: "token-a" });
  const stopA = makeStop({ placeId: placeA.id, position: 0 });
  const { deps, getStops } = createFakeDeps({ places: [placeA], stops: [stopA] });

  const result = await checkInStopWithQr({ userId: "user-1", qrToken: "token-a" }, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.stop.checkInMethod, "qr");
    assert.notEqual(result.stop.visitedAt, null);
    assert.equal(result.alreadyVisited, false);
  }
  assert.notEqual(getStops()[0].visitedAt, null);
});

test("no active itinerary (no active stay) is a controlled failure", async () => {
  const placeA = makeTestPlace({ category: "restaurant", qrToken: "token-a" });
  const stopA = makeStop({ placeId: placeA.id, position: 0 });
  const { deps } = createFakeDeps({ places: [placeA], stops: [stopA], noActiveStay: true });

  const result = await checkInStopWithQr({ userId: "user-1", qrToken: "token-a" }, NOW, deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "no_active_itinerary");
});

test("no active itinerary (today's day was never generated) is a controlled failure", async () => {
  const placeA = makeTestPlace({ category: "restaurant", qrToken: "token-a" });
  const { deps } = createFakeDeps({ places: [placeA], day: null, stops: [] });

  const result = await checkInStopWithQr({ userId: "user-1", qrToken: "token-a" }, NOW, deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "no_active_itinerary");
});

test("a valid Place QR that isn't in the itinerary at all is rejected", async () => {
  const placeA = makeTestPlace({ category: "restaurant", qrToken: "token-a" });
  const placeOutside = makeTestPlace({ category: "museum", qrToken: "token-outside" });
  const stopA = makeStop({ placeId: placeA.id, position: 0 });
  const { deps } = createFakeDeps({ places: [placeA, placeOutside], stops: [stopA] });

  const result = await checkInStopWithQr({ userId: "user-1", qrToken: "token-outside" }, NOW, deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "place_not_next");
});

test("a later stop's QR is rejected while an earlier stop is still unvisited", async () => {
  const placeA = makeTestPlace({ category: "restaurant", qrToken: "token-a" });
  const placeB = makeTestPlace({ category: "museum", qrToken: "token-b" });
  const stopA = makeStop({ placeId: placeA.id, position: 0 });
  const stopB = makeStop({ placeId: placeB.id, position: 1 });
  const { deps, getStops } = createFakeDeps({ places: [placeA, placeB], stops: [stopA, stopB] });

  const result = await checkInStopWithQr({ userId: "user-1", qrToken: "token-b" }, NOW, deps);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "place_not_next");
    assert.equal(result.nextStop?.id, stopA.id);
  }
  assert.ok(getStops().every((s) => s.visitedAt === null), "neither stop should be visited");
});

test("re-scanning an already-completed stop's QR is idempotent", async () => {
  const placeA = makeTestPlace({ category: "restaurant", qrToken: "token-a" });
  const visitedAt = new Date("2026-03-10T09:00:00Z");
  const stopA = makeStop({ placeId: placeA.id, position: 0, visitedAt, checkInMethod: "qr" });
  const stopB = makeStop({ placeId: makeTestPlace({ category: "museum" }).id, position: 1 });
  const { deps } = createFakeDeps({ places: [placeA], stops: [stopA, stopB] });

  const result = await checkInStopWithQr({ userId: "user-1", qrToken: "token-a" }, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.alreadyVisited, true);
    assert.equal(result.stop.visitedAt?.getTime(), visitedAt.getTime(), "visitedAt must not change");
  }
});

test("cross-user: User B's scan resolves only User B's own itinerary, never User A's, even sharing the same Place", async () => {
  const placeA = makeTestPlace({ category: "restaurant", qrToken: "token-a" });
  const otherPlace = makeTestPlace({ category: "museum" });
  const userAStop = makeStop({ placeId: placeA.id, position: 0 });
  const userBStop = makeStop({ placeId: otherPlace.id, position: 0 }); // User B's own itinerary does NOT include placeA

  const userAStay = { id: "stay-a", checkIn: new Date("2026-03-10T08:00:00Z"), checkOut: null, hotel: makeHotel("hotel-a-place", "hp-a"), place: makeTestPlace({ category: "hotel" }) };
  const userBStay = { id: "stay-b", checkIn: new Date("2026-03-10T08:00:00Z"), checkOut: null, hotel: makeHotel("hotel-b-place", "hp-b"), place: makeTestPlace({ category: "hotel" }) };
  const dayA = makeDay({ id: "day-a", userId: "user-a", hotelId: "hp-a" });
  const dayB = makeDay({ id: "day-b", userId: "user-b", hotelId: "hp-b" });

  const stopsByDay = new Map<string, ItineraryStop[]>([
    ["day-a", [userAStop]],
    ["day-b", [userBStop]],
  ]);

  const deps: QrCheckInDependencies = {
    findPlaceByQrToken: async (token) => [placeA, otherPlace].find((p) => p.qrToken === token) ?? null,
    findActiveStayForUser: async (uid) => (uid === "user-a" ? userAStay : uid === "user-b" ? userBStay : null),
    findItineraryDay: async (uid, hotelId) => (uid === "user-a" && hotelId === "hp-a" ? dayA : uid === "user-b" && hotelId === "hp-b" ? dayB : null),
    listItineraryStops: async (dayId) => stopsByDay.get(dayId) ?? [],
    loadAvailabilityContext: async (uid) => ({
      stay: { id: "stay-1", hotelId: uid === "user-a" ? "hp-a" : "hp-b", dayNumber: 1 },
      eligiblePlaceIds: { has: () => true } as unknown as ReadonlySet<string>,
    }),
    markStopVisited: async (stopId, dayId, checkInMethod) => {
      const stops = stopsByDay.get(dayId) ?? [];
      const target = stops.find((s) => s.id === stopId);
      if (!target || target.visitedAt !== null) return null;
      const visited = { ...target, visitedAt: new Date(), checkInMethod };
      stopsByDay.set(dayId, stops.map((s) => (s.id === stopId ? visited : s)));
      return { stop: visited, dayCompleted: stopsByDay.get(dayId)!.every((s) => s.visitedAt !== null) };
    },
  };

  const resultForUserB = await checkInStopWithQr({ userId: "user-b", qrToken: "token-a" }, NOW, deps);
  assert.equal(resultForUserB.ok, false);
  if (!resultForUserB.ok) assert.equal(resultForUserB.reason, "place_not_next");
  assert.ok(stopsByDay.get("day-a")!.every((s) => s.visitedAt === null), "User A's stop must be untouched by User B's attempt");
  assert.ok(stopsByDay.get("day-b")!.every((s) => s.visitedAt === null), "User B's own stop is unaffected too");
});

test("completing the final QR stop marks the day completed", async () => {
  const placeA = makeTestPlace({ category: "restaurant", qrToken: "token-a" });
  const stopA = makeStop({
    placeId: placeA.id,
    position: 0,
    visitedAt: new Date("2026-03-10T08:30:00Z"),
    checkInMethod: "gps",
  });
  const placeB = makeTestPlace({ category: "museum", qrToken: "token-b" });
  const stopB = makeStop({ placeId: placeB.id, position: 1 });
  const { deps, getCompletedAt } = createFakeDeps({ places: [placeA, placeB], stops: [stopA, stopB] });

  const result = await checkInStopWithQr({ userId: "user-1", qrToken: "token-b" }, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.dayCompleted, true);
    assert.equal(result.nextStop, null);
  }
  assert.notEqual(getCompletedAt(), null);
});

test("completing a non-final QR stop leaves the day incomplete", async () => {
  const placeA = makeTestPlace({ category: "restaurant", qrToken: "token-a" });
  const stopA = makeStop({ placeId: placeA.id, position: 0 });
  const stopB = makeStop({ placeId: makeTestPlace({ category: "museum" }).id, position: 1 });
  const { deps, getCompletedAt } = createFakeDeps({ places: [placeA], stops: [stopA, stopB] });

  await checkInStopWithQr({ userId: "user-1", qrToken: "token-a" }, NOW, deps);
  assert.equal(getCompletedAt(), null);
});

test("concurrency: two simultaneous QR scans for the same stop result in exactly one real transition", async () => {
  const placeA = makeTestPlace({ category: "restaurant", qrToken: "token-a" });
  const stopA = makeStop({ placeId: placeA.id, position: 0 });
  const { deps, getStops } = createFakeDeps({ places: [placeA], stops: [stopA] });

  const [a, b] = await Promise.all([
    checkInStopWithQr({ userId: "user-1", qrToken: "token-a" }, NOW, deps),
    checkInStopWithQr({ userId: "user-1", qrToken: "token-a" }, NOW, deps),
  ]);

  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  const alreadyVisitedFlags = [a, b].map((r) => (r.ok ? r.alreadyVisited : null)).sort();
  assert.deepEqual(alreadyVisitedFlags, [false, true], "exactly one request performs the real transition");
  assert.equal(getStops()[0].visitedAt !== null, true);
});
