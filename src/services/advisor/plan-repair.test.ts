import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { ItineraryDay, ItineraryStop, User } from "@/db/schema";
import type { EligiblePlace } from "@/services/eligibility/rules";
import type { RoutingResult } from "@/services/routing";
import { computeDayCompletedAt } from "./plan-state";
import { removeUnavailableStopForUser, replaceUnavailableStopsForUser, type PlanRepairDependencies } from "./plan-repair";
import { makeTestPlace } from "./test-utils";

// ---- Fixed ids / times: nothing depends on counters, randomness or test order ----
const NOW = new Date("2026-06-15T12:00:00Z");
const USER = "00000000-0000-4000-8000-000000000001";
const OTHER_USER = "00000000-0000-4000-8000-000000000002";
const STAY = "00000000-0000-4000-8000-0000000000a1";
const HOTEL = "00000000-0000-4000-8000-0000000000b1";
const HOTEL_PLACE = "00000000-0000-4000-8000-0000000000b2";
const DAY = "00000000-0000-4000-8000-0000000000c1";
const id = (prefix: string, n: number) => `00000000-0000-4000-8000-0000000000${prefix}${n}`;
const [P1, P2, P3, P4] = [1, 2, 3, 4].map((n) => id("d", n));
const [S1, S2, S3, S4] = [1, 2, 3, 4].map((n) => id("e", n));
const R1 = id("f", 1); // a replacement candidate
const DECOY = id("9", 1); // a nearby Place with NO relationship to the hotel

const hotelPlace = makeTestPlace({ id: HOTEL_PLACE, category: "hotel", latitude: 41.7, longitude: 44.8, name: "Hotel" });
const placeAt = (placeId: string, n: number, name: string) =>
  makeTestPlace({ id: placeId, category: "restaurant", latitude: 41.7 + n * 0.001, longitude: 44.8, name });
const eligibleEntry = (place: ReturnType<typeof makeTestPlace>): EligiblePlace => ({
  place,
  source: "facility",
  relationId: `facility-${place.id}`,
  priority: null,
  facilityType: "other",
});

const baseDay: ItineraryDay = {
  id: DAY,
  userId: USER,
  hotelId: HOTEL,
  hotelStayId: STAY,
  dayNumber: 1,
  stopCount: 4,
  routeGeoJson: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[44.8, 41.7]] } },
  totalDurationSeconds: 7200,
  originalDurationSeconds: 7200,
  generatedAt: new Date("2026-06-15T08:00:00Z"),
  completedAt: null,
};

const stop = (stopId: string, placeId: string, position: number, overrides: Partial<ItineraryStop> = {}): ItineraryStop => ({
  id: stopId,
  dayId: DAY,
  placeId,
  isHotelStop: false,
  checkInMethod: "gps",
  name: `Stop ${position + 1}`,
  category: "restaurant",
  latitude: 41.7 + (position + 1) * 0.001,
  longitude: 44.8,
  imageUrl: null,
  position,
  visitedAt: null,
  supersededAt: null,
  supersededReason: null,
  ...overrides,
});

const okRoute: RoutingResult<{ geometry: GeoJSON.Feature<GeoJSON.LineString, Record<string, never>>; distanceMeters: number; durationSeconds: number }> = {
  ok: true,
  route: {
    geometry: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[44.8, 41.7], [44.8, 41.71]] } },
    distanceMeters: 500,
    durationSeconds: 600,
  },
};

type WorldOptions = {
  stops: ItineraryStop[];
  /** Places eligible for the hotel right now (the replacement pool + the still-valid stops). */
  eligible: ReturnType<typeof makeTestPlace>[];
  validStay?: boolean;
  route?: typeof okRoute | { ok: false; reason: "no_route"; message: string };
  persistResult?: "real" | "conflict";
};

/** An in-memory stand-in for the repair dependencies that mirrors the real persistence contract (supersede, never delete). */
function makeWorld(options: WorldOptions) {
  const state = {
    stops: options.stops.map((s) => ({ ...s })),
    day: { ...baseDay },
    routeCalls: [] as Array<{ origin: { lat: number; lng: number }; stops: Array<{ lat: number; lng: number }>; returnToOrigin?: boolean }>,
    replacementPersists: 0,
    removalPersists: 0,
  };
  const user: User = { id: USER, email: "g@example.com", passwordHash: "x", role: "user", createdAt: NOW, updatedAt: NOW };
  const active = () => state.stops.filter((s) => s.supersededAt === null).sort((a, b) => a.position - b.position);
  const refreshDay = (routeGeoJson: unknown, totalDurationSeconds: number | null) => {
    const list = active();
    state.day = {
      ...state.day,
      stopCount: list.length,
      routeGeoJson: routeGeoJson as ItineraryDay["routeGeoJson"],
      // Mirrors the real persistence: the ACTIVE duration follows the repaired route; originalDurationSeconds is never touched.
      totalDurationSeconds,
      completedAt: computeDayCompletedAt(list, state.day.completedAt, NOW),
    };
  };

  const deps: PlanRepairDependencies = {
    findUserById: async (userId) => (userId === USER ? user : null),
    findActiveStayForUser: async (userId) =>
      userId === USER && options.validStay !== false
        ? { id: STAY, checkIn: new Date("2026-06-15T08:00:00Z"), checkOut: null, hotel: { id: HOTEL, placeId: HOTEL_PLACE, qrToken: "x", createdAt: NOW, updatedAt: NOW }, place: hotelPlace }
        : null,
    findPreferencesForUser: async () => ({ userId: USER, categories: ["restaurant"], budget: null, activityLevel: null, updatedAt: NOW }),
    findItineraryDay: async (userId, hotelId, dayNumber) => (userId === USER && hotelId === HOTEL && dayNumber === 1 ? state.day : null),
    listItineraryStops: async () => active(),
    findItineraryStopWithDay: async (stopId) => {
      const found = state.stops.find((s) => s.id === stopId && s.supersededAt === null);
      return found ? { stop: found, day: state.day } : null;
    },
    listEligiblePlacesForStay: async () => options.eligible.map(eligibleEntry),
    getStopUsageHistory: async () => new Map(),
    getWalkingRouteInOrder: async (input) => {
      state.routeCalls.push(input);
      return options.route ?? okRoute;
    },
    persistStopReplacement: async (input) => {
      state.replacementPersists += 1;
      if (options.persistResult === "conflict") return { status: "conflict" };
      const target = state.stops.filter((s) => input.supersedeStopIds.includes(s.id) && s.visitedAt === null && s.supersededAt === null);
      if (target.length !== input.supersedeStopIds.length) return { status: "conflict" };
      state.stops = state.stops.map((s) => (input.supersedeStopIds.includes(s.id) ? { ...s, supersededAt: input.now, supersededReason: "stop_unavailable" as const } : s));
      input.replacements.forEach((r, i) => state.stops.push({ id: id("a", i + 1), dayId: DAY, position: r.position, supersededAt: null, supersededReason: null, ...r.stop }));
      refreshDay(input.routeGeoJson, input.totalDurationSeconds);
      return { status: "updated", day: state.day, stops: active() };
    },
    persistStopRemoval: async (input) => {
      state.removalPersists += 1;
      const target = state.stops.find((s) => s.id === input.stopId && s.visitedAt === null && s.supersededAt === null);
      if (!target) return { status: "conflict" };
      state.stops = state.stops.map((s) => (s.id === input.stopId ? { ...s, supersededAt: input.now, supersededReason: "removed_unavailable" as const } : s));
      refreshDay(input.routeGeoJson, input.totalDurationSeconds);
      return { status: "updated", day: state.day, stops: active() };
    },
  };
  return { state, deps, active };
}

const plan = () => [
  stop(S1, P1, 0, { visitedAt: new Date("2026-06-15T09:00:00Z"), checkInMethod: "gps" }), // completed
  stop(S2, P2, 1), // pending, available
  stop(S3, P3, 2), // pending, becomes unavailable
  stop(S4, P4, 3), // pending, available
];
const stopPlaces = [placeAt(P1, 1, "P1"), placeAt(P2, 2, "P2"), placeAt(P3, 3, "P3"), placeAt(P4, 4, "P4")];

describe("replaceUnavailableStopsForUser — explicit, server-enforced, replaces ONLY unavailable pending stops", () => {
  test("refuses when no pending stop is unavailable (not a general regenerate); nothing is routed or persisted", async () => {
    const w = makeWorld({ stops: plan(), eligible: [...stopPlaces, placeAt(R1, 5, "R1")] });
    const result = await replaceUnavailableStopsForUser(USER, NOW, w.deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "nothing_to_regenerate");
    assert.equal(w.state.routeCalls.length, 0);
    assert.equal(w.state.replacementPersists, 0);
  });

  test("replaces only the unavailable stop; completed and still-available pending stops are retained exactly, and the replacement takes the vacated slot", async () => {
    const before = plan();
    // P3 is no longer eligible; R1 is a valid eligible replacement.
    const w = makeWorld({ stops: before, eligible: [stopPlaces[0], stopPlaces[1], stopPlaces[3], placeAt(R1, 5, "R1")] });
    const result = await replaceUnavailableStopsForUser(USER, NOW, w.deps);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.replaced, 1);
    assert.equal(result.droppedWithoutReplacement, 0);

    // Active plan: S1 (completed), S2, R1 (in S3's slot), S4 — order kept.
    const activeNow = w.active();
    assert.deepEqual(activeNow.map((s) => s.placeId), [P1, P2, R1, P4]);
    assert.deepEqual(activeNow.map((s) => s.position), [0, 1, 2, 3]);

    // Completed stop: byte-for-byte unchanged (row, position, visit time, method).
    assert.deepEqual(activeNow[0], before[0]);
    // Still-available pending stops: unchanged.
    assert.deepEqual(activeNow[1], before[1]);
    assert.deepEqual(activeNow[3], before[3]);

    // The unavailable stop is SUPERSEDED, not deleted: its snapshot is kept as history.
    const history = w.state.stops.find((s) => s.id === S3);
    assert.ok(history, "the old row still exists");
    assert.equal(history.supersededReason, "stop_unavailable");
    assert.equal(history.name, before[2].name);
    assert.equal(history.latitude, before[2].latitude);
    assert.equal(w.state.stops.length, 5, "4 original rows + 1 replacement; nothing deleted");
  });

  test("the retained stops keep their order: the route is a FIXED-ORDER route (hotel -> retained + replacement in slot order -> hotel), never re-optimized", async () => {
    const w = makeWorld({ stops: plan(), eligible: [stopPlaces[0], stopPlaces[1], stopPlaces[3], placeAt(R1, 5, "R1")] });
    await replaceUnavailableStopsForUser(USER, NOW, w.deps);
    assert.equal(w.state.routeCalls.length, 1);
    const call = w.state.routeCalls[0];
    assert.deepEqual(call.origin, { lat: hotelPlace.latitude, lng: hotelPlace.longitude });
    assert.equal(call.returnToOrigin, true);
    // Pending stops only (the completed stop is done), in slot order: S2, replacement R1, S4.
    assert.deepEqual(call.stops.map((s) => s.lat), [stopPlaces[1].latitude, placeAt(R1, 5, "R1").latitude, stopPlaces[3].latitude]);
  });

  test("replacements come ONLY from the hotel's eligible Places: a nearby non-partner is never chosen, and neither is a Place already in today's plan", async () => {
    const decoy = placeAt(DECOY, 6, "Nearby non-partner"); // exists in the 'database' but is NOT in the eligible list
    const w = makeWorld({ stops: plan(), eligible: [stopPlaces[0], stopPlaces[1], stopPlaces[3], placeAt(R1, 5, "R1")] });
    const result = await replaceUnavailableStopsForUser(USER, NOW, w.deps);
    assert.equal(result.ok, true);
    const placeIds = w.active().map((s) => s.placeId);
    assert.equal(placeIds.includes(decoy.id), false);
    assert.equal(placeIds.filter((p) => p === P2).length, 1, "P2 (already in the plan) is not picked again");
    assert.ok(placeIds.includes(R1));
  });

  test("fewer replacements than unavailable stops gives a shorter plan (never a repeat or a substitute)", async () => {
    // S2 and S3 both unavailable; only ONE replacement candidate exists.
    const w = makeWorld({ stops: plan(), eligible: [stopPlaces[0], stopPlaces[3], placeAt(R1, 5, "R1")] });
    const result = await replaceUnavailableStopsForUser(USER, NOW, w.deps);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.replaced, 1);
    assert.equal(result.droppedWithoutReplacement, 1);
    assert.deepEqual(w.active().map((s) => s.placeId), [P1, R1, P4], "R1 takes the first vacated slot; the plan is one stop shorter");
    assert.equal(w.state.day.stopCount, 3);
  });

  test("no replacement found: NOTHING is changed (no persist, no route call) and the unavailable stop is offered for explicit removal", async () => {
    const before = plan();
    const w = makeWorld({ stops: before, eligible: [stopPlaces[0], stopPlaces[1], stopPlaces[3]] }); // P3 gone, no other candidates
    const result = await replaceUnavailableStopsForUser(USER, NOW, w.deps);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.reason, "no_replacement_available");
      assert.deepEqual(result.unavailableStops, [{ id: S3, name: "Stop 3" }]);
    }
    assert.equal(w.state.replacementPersists, 0);
    assert.equal(w.state.routeCalls.length, 0);
    assert.deepEqual(w.state.stops, before, "the saved plan is exactly as it was");
  });

  test("a routing failure changes nothing", async () => {
    const before = plan();
    const w = makeWorld({ stops: before, eligible: [stopPlaces[0], stopPlaces[1], stopPlaces[3], placeAt(R1, 5, "R1")], route: { ok: false, reason: "no_route", message: "no" } });
    const result = await replaceUnavailableStopsForUser(USER, NOW, w.deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "routing_failed");
    assert.equal(w.state.replacementPersists, 0);
    assert.deepEqual(w.state.stops, before);
  });

  test("a concurrent change (e.g. a check-in won the race) reports a conflict and changes nothing", async () => {
    const before = plan();
    const w = makeWorld({ stops: before, eligible: [stopPlaces[0], stopPlaces[1], stopPlaces[3], placeAt(R1, 5, "R1")], persistResult: "conflict" });
    const result = await replaceUnavailableStopsForUser(USER, NOW, w.deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "conflict");
    assert.deepEqual(w.state.stops, before);
  });

  test("a guest without a valid stay cannot repair anything", async () => {
    const w = makeWorld({ stops: plan(), eligible: [], validStay: false });
    const result = await replaceUnavailableStopsForUser(USER, NOW, w.deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_active_stay");
  });

  test("repeating the action is safe: the second call finds nothing unavailable", async () => {
    const w = makeWorld({ stops: plan(), eligible: [stopPlaces[0], stopPlaces[1], stopPlaces[3], placeAt(R1, 5, "R1")] });
    assert.equal((await replaceUnavailableStopsForUser(USER, NOW, w.deps)).ok, true);
    const again = await replaceUnavailableStopsForUser(USER, NOW, w.deps);
    assert.equal(again.ok, false);
    if (!again.ok) assert.equal(again.reason, "nothing_to_regenerate");
  });
});

describe("removeUnavailableStopForUser — the explicit way out when no replacement exists", () => {
  const eligibleWithoutP3 = [stopPlaces[0], stopPlaces[1], stopPlaces[3]];

  test("removes the unavailable pending stop; its snapshot is kept in history and it leaves the active plan", async () => {
    const before = plan();
    const w = makeWorld({ stops: before, eligible: eligibleWithoutP3 });
    const result = await removeUnavailableStopForUser({ userId: USER, stopId: S3 }, NOW, w.deps);
    assert.equal(result.ok, true);

    assert.deepEqual(w.active().map((s) => s.id), [S1, S2, S4], "gone from the active plan");
    const history = w.state.stops.find((s) => s.id === S3);
    assert.ok(history, "the row is still there as history");
    assert.equal(history.supersededReason, "removed_unavailable");
    assert.ok(history.supersededAt);
    assert.equal(history.name, before[2].name, "snapshot fields preserved");
    assert.equal(history.latitude, before[2].latitude);
    assert.deepEqual(w.active()[0], before[0], "the completed stop is untouched");
    assert.equal(w.state.day.stopCount, 3);
  });

  test("the route for the remaining pending stops is recomputed in their existing order", async () => {
    const w = makeWorld({ stops: plan(), eligible: eligibleWithoutP3 });
    await removeUnavailableStopForUser({ userId: USER, stopId: S3 }, NOW, w.deps);
    assert.equal(w.state.routeCalls.length, 1);
    assert.deepEqual(w.state.routeCalls[0].stops.map((s) => s.lat), [stopPlaces[1].latitude, stopPlaces[3].latitude]);
  });

  test("removing the last pending stop completes the day (completed stops are what remain)", async () => {
    const w = makeWorld({
      stops: [stop(S1, P1, 0, { visitedAt: new Date("2026-06-15T09:00:00Z") }), stop(S2, P2, 1)],
      eligible: [stopPlaces[0]], // P2 unavailable
    });
    const result = await removeUnavailableStopForUser({ userId: USER, stopId: S2 }, NOW, w.deps);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.dayCompleted, true);
    assert.deepEqual(w.state.day.completedAt, NOW);
    assert.equal(w.state.routeCalls.length, 0, "no pending stops left, so there is no route to compute");
    assert.equal(w.state.day.routeGeoJson, null, "the stale route line is cleared");
  });

  test("a stop that is still available cannot be removed", async () => {
    const before = plan();
    const w = makeWorld({ stops: before, eligible: eligibleWithoutP3 });
    const result = await removeUnavailableStopForUser({ userId: USER, stopId: S2 }, NOW, w.deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "stop_still_available");
    assert.deepEqual(w.state.stops, before);
    assert.equal(w.state.removalPersists, 0);
  });

  test("a COMPLETED stop can never be removed, even if its Place is no longer eligible", async () => {
    const before = plan();
    const w = makeWorld({ stops: before, eligible: [] });
    const result = await removeUnavailableStopForUser({ userId: USER, stopId: S1 }, NOW, w.deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_pending");
    assert.deepEqual(w.state.stops, before);
  });

  test("another guest's stop is 'not found'", async () => {
    const w = makeWorld({ stops: plan(), eligible: eligibleWithoutP3 });
    const result = await removeUnavailableStopForUser({ userId: OTHER_USER, stopId: S3 }, NOW, w.deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_found");
    assert.equal(w.state.removalPersists, 0);
  });

  test("an already-superseded stop is history: 'not found', never removable again", async () => {
    const w = makeWorld({ stops: [...plan().slice(0, 2), stop(S3, P3, 2, { supersededAt: NOW, supersededReason: "removed_unavailable" })], eligible: eligibleWithoutP3 });
    const result = await removeUnavailableStopForUser({ userId: USER, stopId: S3 }, NOW, w.deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "not_found");
  });

  test("without a valid stay nothing can be removed", async () => {
    const w = makeWorld({ stops: plan(), eligible: eligibleWithoutP3, validStay: false });
    const result = await removeUnavailableStopForUser({ userId: USER, stopId: S3 }, NOW, w.deps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_active_stay");
  });

  test("a failed route recompute still removes the stop but clears the stale line instead of keeping it", async () => {
    const w = makeWorld({ stops: plan(), eligible: eligibleWithoutP3, route: { ok: false, reason: "no_route", message: "no" } });
    const result = await removeUnavailableStopForUser({ userId: USER, stopId: S3 }, NOW, w.deps);
    assert.equal(result.ok, true);
    assert.equal(w.state.day.routeGeoJson, null);
  });
});

describe("displayed duration stays accurate after a repair; the original estimate is kept separately", () => {
  const eligibleAfter = [stopPlaces[0], stopPlaces[1], stopPlaces[3], placeAt(R1, 5, "R1")];

  test("after a replacement the ACTIVE duration is the repaired route's duration, and the ORIGINAL estimate is untouched", async () => {
    const w = makeWorld({ stops: plan(), eligible: eligibleAfter });
    assert.equal(w.state.day.totalDurationSeconds, 7200);
    const result = await replaceUnavailableStopsForUser(USER, NOW, w.deps);
    assert.equal(result.ok, true);
    assert.equal(w.state.day.totalDurationSeconds, 600, "shows the repaired route's time (okRoute = 600s)");
    assert.equal(w.state.day.originalDurationSeconds, 7200, "the original estimate used by the difficulty ratchet is unchanged");
    if (result.ok) assert.equal(result.day.totalDurationSeconds, 600);
  });

  test("fractional seconds from Mapbox are rounded to a whole number (the column is an integer)", async () => {
    const w = makeWorld({
      stops: plan(),
      eligible: eligibleAfter,
      route: { ok: true, route: { ...okRoute.route, durationSeconds: 1234.6 } } as typeof okRoute,
    });
    await replaceUnavailableStopsForUser(USER, NOW, w.deps);
    assert.equal(w.state.day.totalDurationSeconds, 1235);
  });

  test("when nothing changes (no replacement found, routing failed, nothing unavailable) neither duration moves", async () => {
    const noReplacement = makeWorld({ stops: plan(), eligible: [stopPlaces[0], stopPlaces[1], stopPlaces[3]] });
    await replaceUnavailableStopsForUser(USER, NOW, noReplacement.deps);
    assert.equal(noReplacement.state.day.totalDurationSeconds, 7200);
    assert.equal(noReplacement.state.day.originalDurationSeconds, 7200);

    const routingFails = makeWorld({ stops: plan(), eligible: eligibleAfter, route: { ok: false, reason: "no_route", message: "no" } });
    await replaceUnavailableStopsForUser(USER, NOW, routingFails.deps);
    assert.equal(routingFails.state.day.totalDurationSeconds, 7200);

    const nothing = makeWorld({ stops: plan(), eligible: [...stopPlaces] });
    await replaceUnavailableStopsForUser(USER, NOW, nothing.deps);
    assert.equal(nothing.state.day.totalDurationSeconds, 7200);
  });

  test("removing an unavailable stop updates the active duration to the recomputed route; the original stays", async () => {
    const w = makeWorld({ stops: plan(), eligible: [stopPlaces[0], stopPlaces[1], stopPlaces[3]] });
    const result = await removeUnavailableStopForUser({ userId: USER, stopId: S3 }, NOW, w.deps);
    assert.equal(result.ok, true);
    assert.equal(w.state.day.totalDurationSeconds, 600);
    assert.equal(w.state.day.originalDurationSeconds, 7200);
  });

  test("removal with no pending stops left, or a failed route recompute, clears the active duration instead of showing a stale one", async () => {
    const lastPending = makeWorld({
      stops: [stop(S1, P1, 0, { visitedAt: new Date("2026-06-15T09:00:00Z") }), stop(S2, P2, 1)],
      eligible: [stopPlaces[0]],
    });
    await removeUnavailableStopForUser({ userId: USER, stopId: S2 }, NOW, lastPending.deps);
    assert.equal(lastPending.state.day.totalDurationSeconds, null);
    assert.equal(lastPending.state.day.originalDurationSeconds, 7200);

    const routeFails = makeWorld({ stops: plan(), eligible: [stopPlaces[0], stopPlaces[1], stopPlaces[3]], route: { ok: false, reason: "no_route", message: "no" } });
    await removeUnavailableStopForUser({ userId: USER, stopId: S3 }, NOW, routeFails.deps);
    assert.equal(routeFails.state.day.totalDurationSeconds, null);
    assert.equal(routeFails.state.day.originalDurationSeconds, 7200);
  });
});
