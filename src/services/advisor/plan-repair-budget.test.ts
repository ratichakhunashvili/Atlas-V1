import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ItineraryDay, ItineraryStop, User } from "@/db/schema";
import type { EligiblePlace } from "@/services/eligibility/rules";
import { computeDayCompletedAt } from "./plan-state";
import { removeUnavailableStopForUser, replaceUnavailableStopsForUser, type PlanRepairDependencies } from "./plan-repair";
import { makeTestPlace } from "./test-utils";

/**
 * A repair must not quietly hand the guest a longer day than the one they asked
 * for, and must not lose the record of what they asked for.
 */

const NOW = new Date("2026-06-15T12:00:00Z");
const USER = "00000000-0000-4000-b000-000000000001";
const STAY = "00000000-0000-4000-b000-0000000000a1";
const HOTEL = "00000000-0000-4000-b000-0000000000b1";
const HOTEL_PLACE = "00000000-0000-4000-b000-0000000000b2";
const DAY = "00000000-0000-4000-b000-0000000000c1";

const hotelPlace = makeTestPlace({ id: HOTEL_PLACE, category: "hotel", latitude: 41.7, longitude: 44.8, name: "Hotel" });

/** Close enough to the hotel that the ESTIMATE never decides these tests — the routed duration does. */
const nearbyPlace = (suffix: string, name: string, visitDurationMinutes: number) =>
  makeTestPlace({
    id: `00000000-0000-4000-b000-0000000000d${suffix}`,
    category: "restaurant",
    latitude: 41.7004,
    longitude: 44.8004,
    name,
    visitDurationMinutes,
  });

const eligibleEntry = (place: ReturnType<typeof makeTestPlace>): EligiblePlace => ({
  place,
  source: "facility",
  relationId: `facility-${place.id}`,
  priority: null,
  facilityType: "other",
});

function makeStop(stopId: string, placeId: string, position: number, overrides: Partial<ItineraryStop> = {}): ItineraryStop {
  return {
    id: stopId,
    dayId: DAY,
    placeId,
    isHotelStop: false,
    checkInMethod: "gps",
    name: `Stop ${position + 1}`,
    category: "restaurant",
    latitude: 41.7004,
    longitude: 44.8004,
    imageUrl: null,
    visitDurationMinutes: 20,
    position,
    visitedAt: null,
    supersededAt: null,
    supersededReason: null,
    ...overrides,
  };
}

type WorldOptions = {
  stops: ItineraryStop[];
  eligible: ReturnType<typeof makeTestPlace>[];
  availableMinutes: number | null;
  routeSeconds: number;
  /** When the plan was generated. The window runs from here, so this is how a test makes time pass. */
  generatedAt?: Date;
};

function makeWorld(options: WorldOptions) {
  const state = {
    stops: options.stops.map((stop) => ({ ...stop })),
    day: {
      id: DAY,
      userId: USER,
      principalId: null,
      hotelId: HOTEL,
      hotelStayId: STAY,
      dayNumber: 1,
      stopCount: options.stops.length,
      routeGeoJson: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[44.8, 41.7]] } },
      totalDurationSeconds: 3600,
      originalDurationSeconds: 3600,
      availableMinutes: options.availableMinutes,
      generatedAt: options.generatedAt ?? new Date("2026-06-15T12:00:00Z"),
      completedAt: null,
    } as ItineraryDay,
    routeCalls: 0,
  };

  const user: User = { id: USER, email: "g@example.test", name: null, passwordHash: "x", role: "user", createdAt: NOW, updatedAt: NOW };
  const active = () => state.stops.filter((stop) => stop.supersededAt === null).sort((a, b) => a.position - b.position);

  const deps: PlanRepairDependencies = {
    findUserById: async () => user,
    findActiveStayForUser: async () => ({
      id: STAY,
      checkIn: new Date("2026-06-15T08:00:00Z"),
      checkOut: null,
      hotel: { id: HOTEL, placeId: HOTEL_PLACE, qrToken: null, createdAt: NOW, updatedAt: NOW },
      place: hotelPlace,
    }),
    findPreferencesForUser: async () => ({
      userId: USER,
      principalId: null,
      categories: ["restaurant"],
      budget: null,
      activityLevel: null,
      maxDistanceMeters: null,
      updatedAt: NOW,
    }),
    findItineraryDay: async () => state.day,
    listItineraryStops: async () => active(),
    findItineraryStopWithDay: async (stopId) => {
      const found = state.stops.find((stop) => stop.id === stopId && stop.supersededAt === null);
      return found ? { stop: found, day: state.day } : null;
    },
    listEligiblePlacesForStay: async () => options.eligible.map(eligibleEntry),
    getStopUsageHistory: async () => new Map(),
    getWalkingRouteInOrder: async () => {
      state.routeCalls += 1;
      return {
        ok: true,
        route: {
          geometry: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[44.8, 41.7]] } },
          distanceMeters: 400,
          durationSeconds: options.routeSeconds,
        },
      };
    },
    persistStopReplacement: async (input) => {
      state.stops = state.stops.map((stop) =>
        input.supersedeStopIds.includes(stop.id)
          ? { ...stop, supersededAt: input.now, supersededReason: "stop_unavailable" as const }
          : stop
      );
      input.replacements.forEach((replacement, index) =>
        state.stops.push({
          id: `replacement-${index}`,
          dayId: DAY,
          position: replacement.position,
          supersededAt: null,
          supersededReason: null,
          ...replacement.stop,
        })
      );
      // Mirrors the real persistence: the window is NOT part of the patch, so it survives.
      state.day = {
        ...state.day,
        stopCount: active().length,
        routeGeoJson: input.routeGeoJson as ItineraryDay["routeGeoJson"],
        totalDurationSeconds: input.totalDurationSeconds,
        completedAt: computeDayCompletedAt(active(), state.day.completedAt, NOW),
      };
      return { status: "updated", day: state.day, stops: active() };
    },
    persistStopRemoval: async (input) => {
      state.stops = state.stops.map((stop) =>
        stop.id === input.stopId
          ? { ...stop, supersededAt: input.now, supersededReason: "removed_unavailable" as const }
          : stop
      );
      state.day = {
        ...state.day,
        stopCount: active().length,
        routeGeoJson: input.routeGeoJson as ItineraryDay["routeGeoJson"],
        totalDurationSeconds: input.totalDurationSeconds,
        completedAt: computeDayCompletedAt(active(), state.day.completedAt, NOW),
      };
      return { status: "updated", day: state.day, stops: active() };
    },
  };

  return { deps, state, active };
}

/** Walking time plus every pending visit, the same sum the repair is held to. */
function repairedPlanMinutes(day: ItineraryDay, stops: ItineraryStop[]): number {
  const pending = stops.filter((stop) => stop.visitedAt === null);
  const visitMinutes = pending.reduce((total, stop) => total + (stop.visitDurationMinutes ?? 0), 0);
  return (day.totalDurationSeconds ?? 0) / 60 + visitMinutes;
}

describe("replacing an unavailable stop keeps the day inside its window", () => {
  it("replaces when the repaired day still fits", async () => {
    const keep = nearbyPlace("1", "Still fine", 20);
    const gone = nearbyPlace("2", "No longer eligible", 20);
    const replacement = nearbyPlace("3", "Replacement", 20);

    const world = makeWorld({
      stops: [makeStop("s1", keep.id, 0), makeStop("s2", gone.id, 1)],
      // `gone` is absent from the eligible set, so its stop is unavailable.
      eligible: [keep, replacement],
      availableMinutes: 120,
      routeSeconds: 1800,
    });

    const result = await replaceUnavailableStopsForUser(USER, NOW, world.deps);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.replaced, 1);
    assert.ok(
      repairedPlanMinutes(result.day, result.stops) <= 120,
      "the repaired day must still fit the window it was planned for"
    );
  });

  it("offers fewer replacements rather than a day that overruns", async () => {
    const keep = nearbyPlace("1", "Still fine", 40);
    const goneA = nearbyPlace("2", "Gone A", 40);
    const goneB = nearbyPlace("4", "Gone B", 40);
    const replacement = nearbyPlace("3", "Long replacement", 40);

    const world = makeWorld({
      stops: [makeStop("s1", keep.id, 0, { visitDurationMinutes: 40 }), makeStop("s2", goneA.id, 1, { visitDurationMinutes: 40 }), makeStop("s3", goneB.id, 2, { visitDurationMinutes: 40 })],
      eligible: [keep, replacement],
      availableMinutes: 120,
      // 30 minutes of walking: 40 (kept) + 30 = 70, so exactly one 40-minute
      // replacement fits (110) and a second would not (150).
      routeSeconds: 1800,
    });

    const result = await replaceUnavailableStopsForUser(USER, NOW, world.deps);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(
      repairedPlanMinutes(result.day, result.stops) <= 120,
      `repaired day must fit 120 minutes (got ${repairedPlanMinutes(result.day, result.stops)})`
    );
  });

  it("changes nothing when even the kept stops no longer fit, leaving removal open", async () => {
    const keep = nearbyPlace("1", "Very long stop", 200);
    const gone = nearbyPlace("2", "Gone", 20);
    const replacement = nearbyPlace("3", "Replacement", 20);

    const world = makeWorld({
      stops: [makeStop("s1", keep.id, 0, { visitDurationMinutes: 200 }), makeStop("s2", gone.id, 1)],
      eligible: [keep, replacement],
      availableMinutes: 60,
      routeSeconds: 1800,
    });

    const before = world.active().map((stop) => ({ ...stop }));
    const result = await replaceUnavailableStopsForUser(USER, NOW, world.deps);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "no_replacement_available");
    assert.deepEqual(world.active(), before, "a refused repair must change nothing at all");
  });

  it("leaves a plan made before windows existed exactly as it behaved before", async () => {
    const keep = nearbyPlace("1", "Still fine", 90);
    const gone = nearbyPlace("2", "Gone", 90);
    const replacement = nearbyPlace("3", "Replacement", 90);

    const world = makeWorld({
      stops: [makeStop("s1", keep.id, 0, { visitDurationMinutes: 90 }), makeStop("s2", gone.id, 1, { visitDurationMinutes: 90 })],
      eligible: [keep, replacement],
      // No window was ever recorded: nothing to hold it to, and no retro-fitting.
      availableMinutes: null,
      routeSeconds: 7200,
    });

    const result = await replaceUnavailableStopsForUser(USER, NOW, world.deps);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.replaced, 1);
  });

  it("keeps the recorded window on the day it repairs", async () => {
    const keep = nearbyPlace("1", "Still fine", 20);
    const gone = nearbyPlace("2", "Gone", 20);
    const replacement = nearbyPlace("3", "Replacement", 20);

    const world = makeWorld({
      stops: [makeStop("s1", keep.id, 0), makeStop("s2", gone.id, 1)],
      eligible: [keep, replacement],
      availableMinutes: 180,
      routeSeconds: 1200,
    });

    const result = await replaceUnavailableStopsForUser(USER, NOW, world.deps);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.day.availableMinutes, 180, "a repair must not erase what the guest asked for");
  });

  it("never supersedes a completed stop while fitting the window", async () => {
    const visited = nearbyPlace("1", "Already visited", 20);
    const gone = nearbyPlace("2", "Gone", 20);
    const replacement = nearbyPlace("3", "Replacement", 20);

    const world = makeWorld({
      stops: [
        makeStop("s1", visited.id, 0, { visitedAt: new Date("2026-06-15T10:00:00Z") }),
        makeStop("s2", gone.id, 1),
      ],
      eligible: [replacement],
      availableMinutes: 120,
      routeSeconds: 1200,
    });

    const result = await replaceUnavailableStopsForUser(USER, NOW, world.deps);

    assert.equal(result.ok, true);
    const completed = world.state.stops.find((stop) => stop.id === "s1");
    assert.equal(completed?.supersededAt, null, "history is never superseded by a repair");
    assert.notEqual(completed?.visitedAt, null);
  });
});

describe("removing an unavailable stop", () => {
  it("keeps the recorded window and leaves the day fitting it", async () => {
    const keep = nearbyPlace("1", "Still fine", 20);
    const gone = nearbyPlace("2", "Gone", 20);

    const world = makeWorld({
      stops: [makeStop("s1", keep.id, 0), makeStop("s2", gone.id, 1)],
      // No replacement is available, so removal is the guest's way forward.
      eligible: [keep],
      availableMinutes: 120,
      routeSeconds: 1200,
    });

    const result = await removeUnavailableStopForUser({ userId: USER, stopId: "s2" }, NOW, world.deps);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.day.availableMinutes, 120, "removal must not erase the window either");
    assert.ok(repairedPlanMinutes(result.day, result.stops) <= 120);
  });

  it("keeps a completed stop untouched", async () => {
    const visited = nearbyPlace("1", "Already visited", 20);
    const gone = nearbyPlace("2", "Gone", 20);

    const world = makeWorld({
      stops: [
        makeStop("s1", visited.id, 0, { visitedAt: new Date("2026-06-15T10:00:00Z") }),
        makeStop("s2", gone.id, 1),
      ],
      eligible: [],
      availableMinutes: 120,
      routeSeconds: 1200,
    });

    await removeUnavailableStopForUser({ userId: USER, stopId: "s2" }, NOW, world.deps);

    const completed = world.state.stops.find((stop) => stop.id === "s1");
    assert.equal(completed?.supersededAt, null);
  });
});

describe("the window runs from when the plan was generated", () => {
  /** The plan was made `minutesAgo` before NOW, so that much of the window is already spent. */
  function worldGeneratedMinutesAgo(minutesAgo: number, availableMinutes: number | null, routeSeconds: number) {
    const keep = nearbyPlace("1", "Still fine", 20);
    const gone = nearbyPlace("2", "Gone", 20);
    const replacement = nearbyPlace("3", "Replacement", 40);

    return {
      keep,
      gone,
      replacement,
      world: makeWorld({
        stops: [makeStop("s1", keep.id, 0), makeStop("s2", gone.id, 1)],
        eligible: [keep, replacement],
        availableMinutes,
        routeSeconds,
        generatedAt: new Date(NOW.getTime() - minutesAgo * 60_000),
      }),
    };
  }

  it("replaces freely when the plan was just generated", async () => {
    const { world } = worldGeneratedMinutesAgo(0, 120, 1200);

    const result = await replaceUnavailableStopsForUser(USER, NOW, world.deps);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.replaced, 1);
  });

  it("refuses the same replacement once most of the window has been spent", async () => {
    // 20 minutes of walking + a kept 20-minute stop + a 40-minute replacement = 80,
    // which fits a fresh 120-minute window but not the 30 minutes left after 90.
    const { world } = worldGeneratedMinutesAgo(90, 120, 1200);

    const before = world.active().map((stop) => ({ ...stop }));
    const result = await replaceUnavailableStopsForUser(USER, NOW, world.deps);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "no_replacement_available");
    assert.deepEqual(world.active(), before, "a refused repair changes nothing");
  });

  it("refuses everything at the zero boundary, when the window has exactly run out", async () => {
    const { world } = worldGeneratedMinutesAgo(120, 120, 600);

    const result = await replaceUnavailableStopsForUser(USER, NOW, world.deps);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "no_replacement_available", "nothing fits in no time at all");
  });

  it("still refuses once the window has been overrun, without going negative", async () => {
    const { world } = worldGeneratedMinutesAgo(400, 120, 600);

    const result = await replaceUnavailableStopsForUser(USER, NOW, world.deps);

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "no_replacement_available");
  });

  it("does not rewrite the original window the guest asked for", async () => {
    const { world } = worldGeneratedMinutesAgo(30, 180, 600);

    const result = await replaceUnavailableStopsForUser(USER, NOW, world.deps);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.day.availableMinutes, 180, "the recorded window is history, not a running total");
  });

  it("leaves a plan with no recorded window alone, however long ago it was generated", async () => {
    const { world } = worldGeneratedMinutesAgo(400, null, 7200);

    const result = await replaceUnavailableStopsForUser(USER, NOW, world.deps);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.replaced, 1);
  });

  it("never traps the guest: removal still works with the window spent", async () => {
    const keep = nearbyPlace("1", "Still fine", 20);
    const gone = nearbyPlace("2", "Gone", 20);

    const world = makeWorld({
      stops: [makeStop("s1", keep.id, 0), makeStop("s2", gone.id, 1)],
      eligible: [keep],
      availableMinutes: 120,
      routeSeconds: 1200,
      generatedAt: new Date(NOW.getTime() - 300 * 60_000),
    });

    const result = await removeUnavailableStopForUser({ userId: USER, stopId: "s2" }, NOW, world.deps);

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.remainingBudgetMinutes, 0, "the time left is reported honestly as none");
    assert.equal(result.day.availableMinutes, 120, "the original window is still recorded");
    assert.equal(
      result.stops.some((stop) => stop.id === "s2" && stop.supersededAt === null),
      false,
      "the stop the guest removed is gone from the active plan"
    );
  });

  it("keeps completed stops through a time-constrained repair", async () => {
    const visited = nearbyPlace("1", "Already visited", 20);
    const gone = nearbyPlace("2", "Gone", 20);

    const world = makeWorld({
      stops: [
        makeStop("s1", visited.id, 0, { visitedAt: new Date("2026-06-15T11:00:00Z") }),
        makeStop("s2", gone.id, 1),
      ],
      eligible: [],
      availableMinutes: 120,
      routeSeconds: 1200,
      generatedAt: new Date(NOW.getTime() - 300 * 60_000),
    });

    await removeUnavailableStopForUser({ userId: USER, stopId: "s2" }, NOW, world.deps);

    const completed = world.state.stops.find((stop) => stop.id === "s1");
    assert.equal(completed?.supersededAt, null, "history survives a repair made against a spent window");
    assert.notEqual(completed?.visitedAt, null);
  });
});
