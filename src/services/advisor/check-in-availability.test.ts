import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { ItineraryDay, ItineraryStop, Place } from "@/db/schema";
import { checkInStopWithGps, type CheckInDependencies } from "./check-in";
import { checkInStopWithQr, type QrCheckInDependencies } from "./check-in-qr";
import { contextFromEligible, type AvailabilityContext } from "./stop-availability";
import { makeTestPlace } from "./test-utils";

// Fixed ids and times: nothing depends on counters, randomness or test order.
const NOW = new Date("2026-06-15T12:00:00Z");
const USER = "00000000-0000-4000-8000-000000000001";
const OTHER_USER = "00000000-0000-4000-8000-000000000002";
const STAY = "00000000-0000-4000-8000-0000000000a1";
const HOTEL = "00000000-0000-4000-8000-0000000000b1";
const DAY = "00000000-0000-4000-8000-0000000000c1";
const P1 = "00000000-0000-4000-8000-0000000000d1";
const P2 = "00000000-0000-4000-8000-0000000000d2";
const P3 = "00000000-0000-4000-8000-0000000000d3";
const S1 = "00000000-0000-4000-8000-0000000000e1";
const S2 = "00000000-0000-4000-8000-0000000000e2";
const S3 = "00000000-0000-4000-8000-0000000000e3";
const HERE = { latitude: 41.7151, longitude: 44.8271 };

const day = (overrides: Partial<ItineraryDay> = {}): ItineraryDay => ({
  id: DAY,
  userId: USER,
  hotelId: HOTEL,
  hotelStayId: STAY,
  dayNumber: 1,
  stopCount: 3,
  routeGeoJson: null,
  totalDurationSeconds: 3600,
  originalDurationSeconds: 3600,
  generatedAt: new Date("2026-06-15T08:00:00Z"),
  completedAt: null,
  ...overrides,
});

const stop = (id: string, placeId: string | null, position: number, overrides: Partial<ItineraryStop> = {}): ItineraryStop => ({
  id,
  dayId: DAY,
  placeId,
  isHotelStop: false,
  checkInMethod: "gps",
  name: `Stop ${position + 1}`,
  category: "restaurant",
  latitude: HERE.latitude,
  longitude: HERE.longitude,
  imageUrl: null,
  position,
  visitedAt: null,
  supersededAt: null,
  supersededReason: null,
  ...overrides,
});

const eligibleOnly = (...placeIds: string[]): AvailabilityContext =>
  contextFromEligible({ id: STAY, hotel: { id: HOTEL }, checkIn: new Date("2026-06-15T08:00:00Z"), checkOut: null }, placeIds.map((id) => ({ place: { id } as never })), NOW);

/** A mutable world: which Places are eligible RIGHT NOW. The loader reads it on every call, and counts calls. */
function makeWorld(initialEligible: string[], initialStops: ItineraryStop[], dayOverrides: Partial<ItineraryDay> = {}) {
  const state = {
    eligible: new Set(initialEligible),
    stops: initialStops,
    day: day(dayOverrides),
    stayValid: true,
    loaderCalls: 0,
    writes: [] as string[],
    /** Optional per-call script: lets a test change eligibility BETWEEN the early check and the pre-write re-check. */
    onLoad: undefined as undefined | ((call: number) => void),
  };

  const loadAvailabilityContext: CheckInDependencies["loadAvailabilityContext"] = async () => {
    state.loaderCalls += 1;
    state.onLoad?.(state.loaderCalls);
    return state.stayValid ? eligibleOnly(...state.eligible) : contextFromEligible(null, [], NOW);
  };

  const active = () => state.stops.filter((s) => s.supersededAt === null).sort((a, b) => a.position - b.position);

  const gpsDeps: CheckInDependencies = {
    // Like the real query: a superseded stop is NOT found.
    findItineraryStopWithDay: async (id) => {
      const found = state.stops.find((s) => s.id === id && s.supersededAt === null);
      return found ? { stop: found, day: state.day } : null;
    },
    listItineraryStops: async () => active(),
    markStopVisited: async (id, _dayId, method) => {
      const target = state.stops.find((s) => s.id === id);
      if (!target || target.visitedAt !== null || target.supersededAt !== null) return null;
      state.writes.push(id);
      const visited = { ...target, visitedAt: NOW, checkInMethod: method };
      state.stops = state.stops.map((s) => (s.id === id ? visited : s));
      return { stop: visited, dayCompleted: active().every((s) => s.visitedAt !== null) };
    },
    loadAvailabilityContext,
  };

  const places = new Map<string, Place>(
    [P1, P2, P3].map((id, i) => [id, makeTestPlace({ id, category: "restaurant", qrToken: `qr-${i + 1}` })])
  );
  const qrDeps: QrCheckInDependencies = {
    findPlaceByQrToken: async (token) => [...places.values()].find((p) => p.qrToken === token) ?? null,
    findActiveStayForUser: async (userId) =>
      userId === USER
        ? {
            id: STAY,
            checkIn: new Date("2026-06-15T08:00:00Z"),
            checkOut: null,
            hotel: { id: HOTEL, placeId: "hotel-place", qrToken: "x", createdAt: NOW, updatedAt: NOW },
            place: makeTestPlace({ id: "hotel-place", category: "hotel" }),
          }
        : null,
    findItineraryDay: async (userId, hotelId, dayNumber) => (userId === USER && hotelId === HOTEL && dayNumber === 1 ? state.day : null),
    listItineraryStops: async () => active(),
    markStopVisited: gpsDeps.markStopVisited,
    loadAvailabilityContext,
  };

  return { state, gpsDeps, qrDeps, active };
}

const threeStops = () => [stop(S1, P1, 0), stop(S2, P2, 1), stop(S3, P3, 2)];

describe("GPS check-in revalidates eligibility server-side", () => {
  test("an available pending stop can be checked in", async () => {
    const w = makeWorld([P1, P2, P3], threeStops());
    const result = await checkInStopWithGps({ userId: USER, stopId: S1, ...HERE }, w.gpsDeps, NOW);
    assert.equal(result.ok, true);
    assert.deepEqual(w.state.writes, [S1]);
  });

  test("an unavailable pending stop is refused with stop_unavailable and NOTHING is written", async () => {
    const w = makeWorld([P2, P3], threeStops()); // P1 no longer eligible
    const result = await checkInStopWithGps({ userId: USER, stopId: S1, ...HERE }, w.gpsDeps, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "stop_unavailable");
    assert.deepEqual(w.state.writes, []);
  });

  test("every cause is refused: Place removed from the stop, no valid stay, day from another stay, day without a stay", async () => {
    const causes: Array<[string, () => ReturnType<typeof makeWorld>]> = [
      ["place removed", () => makeWorld([P1], [stop(S1, null, 0)])],
      ["no valid stay", () => { const w = makeWorld([P1], threeStops()); w.state.stayValid = false; return w; }],
      ["different stay", () => makeWorld([P1], threeStops(), { hotelStayId: "00000000-0000-4000-8000-0000000000a9" })],
      ["no stay on the day", () => makeWorld([P1], threeStops(), { hotelStayId: null })],
    ];
    for (const [label, build] of causes) {
      const w = build();
      const result = await checkInStopWithGps({ userId: USER, stopId: S1, ...HERE }, w.gpsDeps, NOW);
      assert.equal(result.ok, false, label);
      if (!result.ok) assert.equal(result.reason, "stop_unavailable", label);
      assert.deepEqual(w.state.writes, [], label);
    }
  });

  test("a COMPLETED stop is unaffected even when its Place is no longer eligible (history is never re-evaluated)", async () => {
    const w = makeWorld([], [stop(S1, P1, 0, { visitedAt: new Date("2026-06-15T09:00:00Z") })]);
    const result = await checkInStopWithGps({ userId: USER, stopId: S1, ...HERE }, w.gpsDeps, NOW);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.alreadyVisited, true);
    assert.equal(w.state.loaderCalls, 0, "a completed stop is not even evaluated");
  });

  test("another guest's stop is 'not found' — availability is never revealed for it", async () => {
    const w = makeWorld([], threeStops());
    const result = await checkInStopWithGps({ userId: OTHER_USER, stopId: S1, ...HERE }, w.gpsDeps, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_found");
    assert.equal(w.state.loaderCalls, 0);
  });

  test("a superseded stop is history, never actionable: it is 'not found'", async () => {
    const w = makeWorld([P1], [stop(S1, P1, 0, { supersededAt: NOW, supersededReason: "stop_unavailable" })]);
    const result = await checkInStopWithGps({ userId: USER, stopId: S1, ...HERE }, w.gpsDeps, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_found");
    assert.deepEqual(w.state.writes, []);
  });

  test("eligibility is re-checked IMMEDIATELY before the write: eligible at the first check, ineligible at the second -> refused, markStopVisited never called", async () => {
    const w = makeWorld([P1, P2, P3], threeStops());
    // First load (early decision) sees P1 eligible; before the SECOND load (just before the write) the partnership is revoked.
    w.state.onLoad = (call) => {
      if (call === 2) w.state.eligible.delete(P1);
    };
    const result = await checkInStopWithGps({ userId: USER, stopId: S1, ...HERE }, w.gpsDeps, NOW);
    assert.equal(w.state.loaderCalls, 2, "checked twice: once to decide, once right before the write");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "stop_unavailable");
    assert.deepEqual(w.state.writes, [], "no check-in write after the revocation");
  });

  test("a stop that is out of range is refused for distance, not availability (existing rules still apply to available stops)", async () => {
    const w = makeWorld([P1, P2, P3], threeStops());
    const result = await checkInStopWithGps({ userId: USER, stopId: S1, latitude: 41.9, longitude: 45.1 }, w.gpsDeps, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "out_of_range");
  });

  test("client-supplied extras (hotelId, placeId, an 'available' flag) cannot influence the decision: only userId, stopId and coordinates are read", async () => {
    const w = makeWorld([P2, P3], threeStops());
    const forged = { userId: USER, stopId: S1, ...HERE, hotelId: HOTEL, placeId: P1, available: true } as Parameters<typeof checkInStopWithGps>[0];
    const result = await checkInStopWithGps(forged, w.gpsDeps, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "stop_unavailable");
  });
});

describe("stop order is kept: an unavailable stop blocks itself and later stops, earlier available stops stay checkable", () => {
  test("S1 available, S2 unavailable, S3 available", async () => {
    const w = makeWorld([P1, P3], threeStops()); // P2 not eligible

    // S1 (earlier, available) is checkable.
    const first = await checkInStopWithGps({ userId: USER, stopId: S1, ...HERE }, w.gpsDeps, NOW);
    assert.equal(first.ok, true);

    // S2 is unavailable: refused as unavailable.
    const second = await checkInStopWithGps({ userId: USER, stopId: S2, ...HERE }, w.gpsDeps, NOW);
    assert.equal(second.ok, false);
    if (!second.ok) assert.equal(second.reason, "stop_unavailable");

    // S3 is available but BLOCKED by S2 (order is kept): refused as not-next, naming the blocker.
    const third = await checkInStopWithGps({ userId: USER, stopId: S3, ...HERE }, w.gpsDeps, NOW);
    assert.equal(third.ok, false);
    if (!third.ok) {
      assert.equal(third.reason, "stop_not_next");
      assert.equal(third.blockedByUnavailableStop?.id, S2);
    }
    assert.deepEqual(w.state.writes, [S1], "only the earlier available stop was written");
  });

  test("S1 unavailable blocks S2 and S3 too; nothing can be checked in until the plan is updated", async () => {
    const w = makeWorld([P2, P3], threeStops());
    for (const id of [S1, S2, S3]) {
      const result = await checkInStopWithGps({ userId: USER, stopId: id, ...HERE }, w.gpsDeps, NOW);
      assert.equal(result.ok, false, id);
    }
    assert.deepEqual(w.state.writes, []);
  });

  test("a plain out-of-order attempt (no unavailable stop) is the ordinary not-next refusal with no blocker flag", async () => {
    const w = makeWorld([P1, P2, P3], threeStops());
    const result = await checkInStopWithGps({ userId: USER, stopId: S2, ...HERE }, w.gpsDeps, NOW);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "stop_not_next");
      assert.equal(result.blockedByUnavailableStop, undefined);
    }
  });
});

describe("QR check-in revalidates eligibility server-side too", () => {
  const qrStops = () => [stop(S1, P1, 0, { checkInMethod: "qr" }), stop(S2, P2, 1, { checkInMethod: "qr" }), stop(S3, P3, 2, { checkInMethod: "qr" })];

  test("an available stop is checked in by its QR", async () => {
    const w = makeWorld([P1, P2, P3], qrStops());
    const result = await checkInStopWithQr({ userId: USER, qrToken: "qr-1" }, NOW, w.qrDeps);
    assert.equal(result.ok, true);
    assert.deepEqual(w.state.writes, [S1]);
  });

  test("a valid QR for a stop whose Place is no longer eligible is refused, with no write", async () => {
    const w = makeWorld([P2, P3], qrStops());
    const result = await checkInStopWithQr({ userId: USER, qrToken: "qr-1" }, NOW, w.qrDeps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "stop_unavailable");
    assert.deepEqual(w.state.writes, []);
  });

  test("stop order is kept for QR: S2 unavailable blocks S3, while S1 stays checkable", async () => {
    const w = makeWorld([P1, P3], qrStops());
    assert.equal((await checkInStopWithQr({ userId: USER, qrToken: "qr-1" }, NOW, w.qrDeps)).ok, true);
    const blocked = await checkInStopWithQr({ userId: USER, qrToken: "qr-3" }, NOW, w.qrDeps);
    assert.equal(blocked.ok, false);
    if (!blocked.ok) {
      assert.equal(blocked.reason, "place_not_next");
      assert.equal(blocked.blockedByUnavailableStop?.id, S2);
    }
    const unavailable = await checkInStopWithQr({ userId: USER, qrToken: "qr-2" }, NOW, w.qrDeps);
    assert.equal(unavailable.ok, false);
    if (!unavailable.ok) assert.equal(unavailable.reason, "stop_unavailable");
    assert.deepEqual(w.state.writes, [S1]);
  });

  test("eligibility is re-checked IMMEDIATELY before the write (eligible, then revoked) -> refused, nothing written", async () => {
    const w = makeWorld([P1, P2, P3], qrStops());
    w.state.onLoad = (call) => {
      if (call === 2) w.state.eligible.delete(P1);
    };
    const result = await checkInStopWithQr({ userId: USER, qrToken: "qr-1" }, NOW, w.qrDeps);
    assert.equal(w.state.loaderCalls, 2);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "stop_unavailable");
    assert.deepEqual(w.state.writes, []);
  });

  test("a completed stop scanned again is the existing idempotent success, even if its Place is no longer eligible", async () => {
    const w = makeWorld([], [stop(S1, P1, 0, { checkInMethod: "qr", visitedAt: new Date("2026-06-15T09:00:00Z") })]);
    const result = await checkInStopWithQr({ userId: USER, qrToken: "qr-1" }, NOW, w.qrDeps);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.alreadyVisited, true);
  });

  test("a guest with no stay gets the existing no-itinerary refusal (nothing is evaluated for them)", async () => {
    const w = makeWorld([P1], qrStops());
    const result = await checkInStopWithQr({ userId: OTHER_USER, qrToken: "qr-1" }, NOW, w.qrDeps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_active_itinerary");
  });
});
