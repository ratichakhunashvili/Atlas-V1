import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ItineraryDay, ItineraryStop } from "@/db/schema";
import { CHECK_IN_RADIUS_METERS, checkInStopWithGps, type CheckInDependencies } from "./check-in";
import { MAX_ACCURACY_METERS, MAX_CLOCK_SKEW_SECONDS, MAX_READING_AGE_SECONDS } from "./gps-evidence";
import { fakeRecordVerifiedVisit, loadAllAvailable } from "./test-utils";

/**
 * The evidence rules as the real service applies them: a refused reading must
 * change nothing at all, and the rules that were already right — the inclusive
 * 150 m boundary, the saved check-in method — must still hold with evidence in play.
 */

const NOW = new Date("2026-03-10T12:00:00Z");
const STOP_LAT = 41.7151;
const STOP_LNG = 44.8271;

function makeDay(): ItineraryDay {
  return {
    id: "day-1",
    userId: "user-1",
    principalId: null,
    hotelId: "hotel-1",
    hotelStayId: "stay-1",
    dayNumber: 1,
    stopCount: 1,
    routeGeoJson: null,
    totalDurationSeconds: null,
    originalDurationSeconds: null,
    availableMinutes: 120,
    generatedAt: NOW,
    completedAt: null,
  };
}

function makeStop(overrides: Partial<ItineraryStop> = {}): ItineraryStop {
  return {
    id: "stop-1",
    dayId: "day-1",
    placeId: "00000000-0000-4000-8000-0000000000aa",
    isHotelStop: false,
    checkInMethod: "gps",
    name: "A museum",
    category: "museum",
    latitude: STOP_LAT,
    longitude: STOP_LNG,
    imageUrl: null,
    visitDurationMinutes: 30,
    position: 0,
    visitedAt: null,
    supersededAt: null,
    supersededReason: null,
    ...overrides,
  };
}

/** Records every write so a refusal can be asserted to have made none. */
function buildDeps(stop: ItineraryStop) {
  const writes: string[] = [];
  const deps: CheckInDependencies = {
    findItineraryStopWithDay: async () => ({ stop, day: makeDay() }),
    listItineraryStops: async () => [stop],
    markStopVisited: async (stopId) => {
      writes.push(stopId);
      return { stop: { ...stop, visitedAt: NOW }, dayCompleted: true };
    },
    recordVerifiedVisit: fakeRecordVerifiedVisit,
    loadAvailabilityContext: loadAllAvailable,
  };
  return { deps, writes };
}

const atTheStop = {
  latitude: STOP_LAT,
  longitude: STOP_LNG,
  accuracyMeters: 10,
  capturedAtMs: NOW.getTime(),
};

async function attempt(overrides: Partial<typeof atTheStop> = {}, stop = makeStop()) {
  const { deps, writes } = buildDeps(stop);
  const result = await checkInStopWithGps(
    { userId: "user-1", stopId: stop.id, ...atTheStop, ...overrides },
    deps,
    NOW
  );
  return { result, writes };
}

describe("a reading the server will not accept", () => {
  it("refuses an imprecise fix and writes nothing", async () => {
    const { result, writes } = await attempt({ accuracyMeters: MAX_ACCURACY_METERS + 1 });

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "unreliable_position");
    assert.deepEqual(writes, [], "a refused reading must not complete the stop");
  });

  it("refuses a stale fix and writes nothing", async () => {
    const { result, writes } = await attempt({
      capturedAtMs: NOW.getTime() - (MAX_READING_AGE_SECONDS + 1) * 1000,
    });

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "unreliable_position");
    assert.deepEqual(writes, []);
  });

  it("refuses a future fix beyond ordinary skew and writes nothing", async () => {
    const { result, writes } = await attempt({
      capturedAtMs: NOW.getTime() + (MAX_CLOCK_SKEW_SECONDS + 1) * 1000,
    });

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "unreliable_position");
    assert.deepEqual(writes, []);
  });

  it("refuses malformed evidence and writes nothing", async () => {
    for (const override of [{ accuracyMeters: NaN }, { capturedAtMs: NaN }, { accuracyMeters: -5 }]) {
      const { result, writes } = await attempt(override);
      assert.equal(result.ok, false, `${JSON.stringify(override)} must be refused`);
      assert.deepEqual(writes, []);
    }
  });

  it("gives the same message whatever was wrong with it", async () => {
    const imprecise = await attempt({ accuracyMeters: 500 });
    const stale = await attempt({ capturedAtMs: NOW.getTime() - 600_000 });

    assert.equal(
      imprecise.result.ok === false && stale.result.ok === false && imprecise.result.message === stale.result.message,
      true,
      "naming the failing rule would tell a prober what to forge next"
    );
  });
});

describe("a reading the server accepts", () => {
  it("completes the stop at the exact limits of both rules", async () => {
    const { result, writes } = await attempt({
      accuracyMeters: MAX_ACCURACY_METERS,
      capturedAtMs: NOW.getTime() - MAX_READING_AGE_SECONDS * 1000,
    });

    assert.equal(result.ok, true);
    assert.deepEqual(writes, ["stop-1"]);
  });

  it("is idempotent: a repeat of an already-completed stop writes nothing more", async () => {
    const visited = makeStop({ visitedAt: NOW });
    const { result, writes } = await attempt({}, visited);

    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.alreadyVisited, true);
    assert.deepEqual(writes, []);
  });
});

describe("the rules that were already right still hold", () => {
  /** Metres-per-degree of latitude, for placing a point an exact distance north. */
  const METRES_PER_DEGREE_LAT = 111_320;

  it("accepts a guest exactly on the 150 m boundary", async () => {
    const { result, writes } = await attempt({
      latitude: STOP_LAT + CHECK_IN_RADIUS_METERS / METRES_PER_DEGREE_LAT,
    });

    assert.equal(result.ok, true, "the boundary is inclusive");
    assert.deepEqual(writes, ["stop-1"]);
  });

  it("refuses a guest past it", async () => {
    const { result, writes } = await attempt({
      latitude: STOP_LAT + (CHECK_IN_RADIUS_METERS + 25) / METRES_PER_DEGREE_LAT,
    });

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "out_of_range");
    assert.deepEqual(writes, []);
  });

  it("still refuses GPS for a QR stop, however perfect the reading", async () => {
    const { result, writes } = await attempt({}, makeStop({ checkInMethod: "qr" }));

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "wrong_check_in_method");
    assert.deepEqual(writes, []);
  });

  it("checks the reading before the distance, so a bad fix is never measured", async () => {
    // Far away AND imprecise: the evidence rule is the one that should answer.
    const { result } = await attempt({ latitude: 41.9, longitude: 45.1, accuracyMeters: 5000 });

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "unreliable_position");
  });
});
