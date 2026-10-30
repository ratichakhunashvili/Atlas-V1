import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Hotel, ItineraryDay, ItineraryStop, Place } from "@/db/schema";
import { checkInStopWithGps, type CheckInDependencies } from "./check-in";
import { checkInStopWithQr, type QrCheckInDependencies } from "./check-in-qr";
import { createVisitRecorder, loadAllAvailable, makeTestPlace } from "./test-utils";

/**
 * Permanent history is created by a check-in that was ACCEPTED, and by nothing
 * else.
 *
 * Every refusal below is a different rule — evidence, method, order, ownership,
 * eligibility — and each asserts the same thing: the recorder was never called.
 * That is what makes "a failed check-in creates no visit and no unlock" a property
 * of the code rather than a promise in a comment.
 */

const NOW = new Date("2026-03-10T12:00:00Z");
const PLACE_ID = "00000000-0000-4000-c000-0000000000aa";
const STOP_LAT = 41.7151;
const STOP_LNG = 44.8271;

const goodEvidence = {
  latitude: STOP_LAT,
  longitude: STOP_LNG,
  accuracyMeters: 10,
  capturedAtMs: NOW.getTime(),
};

function makeDay(): ItineraryDay {
  return {
    id: "day-1",
    userId: "user-1",
    principalId: null,
    hotelId: "hotel-1",
    hotelStayId: "stay-1",
    dayNumber: 1,
    stopCount: 2,
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
    placeId: PLACE_ID,
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

function gpsWorld(stops: ItineraryStop[], options: { stopWriteSucceeds?: boolean } = {}) {
  const recorder = createVisitRecorder();
  const writes: string[] = [];

  const deps: CheckInDependencies = {
    findItineraryStopWithDay: async (stopId) => {
      const stop = stops.find((candidate) => candidate.id === stopId);
      return stop ? { stop, day: makeDay() } : null;
    },
    listItineraryStops: async () => stops,
    markStopVisited: async (stopId) => {
      if (options.stopWriteSucceeds === false) return null;
      writes.push(stopId);
      const stop = stops.find((candidate) => candidate.id === stopId)!;
      return { stop: { ...stop, visitedAt: NOW }, dayCompleted: false };
    },
    recordVerifiedVisit: recorder.record,
    loadAvailabilityContext: loadAllAvailable,
  };

  return { deps, recorder, writes };
}

describe("an accepted GPS check-in", () => {
  it("records the permanent visit, with the method that proved it", async () => {
    const stop = makeStop();
    const { deps, recorder } = gpsWorld([stop]);

    const result = await checkInStopWithGps({ userId: "user-1", stopId: stop.id, ...goodEvidence }, deps, NOW);

    assert.equal(result.ok, true);
    assert.deepEqual(recorder.calls, [{ userId: "user-1", placeId: PLACE_ID, method: "gps" }]);
  });

  it("refuses a stop whose Place has been deleted, and records nothing", async () => {
    /*
     * The snapshot keeps the plan readable, but a stop with no canonical Place
     * cannot be checked in at all — the existing availability rule treats it as
     * unavailable (`place_removed`), because there is nothing left to verify
     * against. So this never reaches the recorder, which is the right outcome:
     * there would be no Place to say the guest had been to.
     */
    const stop = makeStop({ placeId: null });
    const { deps, recorder, writes } = gpsWorld([stop]);

    const result = await checkInStopWithGps({ userId: "user-1", stopId: stop.id, ...goodEvidence }, deps, NOW);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "stop_unavailable");
    assert.deepEqual(writes, []);
    assert.deepEqual(recorder.calls, []);
  });

  it("records nothing when the stop write was lost to a concurrent request", async () => {
    const stop = makeStop();
    const { deps, recorder } = gpsWorld([stop], { stopWriteSucceeds: false });

    const result = await checkInStopWithGps({ userId: "user-1", stopId: stop.id, ...goodEvidence }, deps, NOW);

    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.alreadyVisited, true);
    assert.deepEqual(recorder.calls, [], "the request that won already recorded it");
  });
});

describe("a refused GPS check-in records nothing", () => {
  it("refuses an unreliable reading", async () => {
    const stop = makeStop();
    const { deps, recorder, writes } = gpsWorld([stop]);

    const result = await checkInStopWithGps(
      { userId: "user-1", stopId: stop.id, ...goodEvidence, accuracyMeters: 500 },
      deps,
      NOW
    );

    assert.equal(result.ok, false);
    assert.deepEqual(writes, []);
    assert.deepEqual(recorder.calls, []);
  });

  it("refuses a stale reading", async () => {
    const stop = makeStop();
    const { deps, recorder } = gpsWorld([stop]);

    const result = await checkInStopWithGps(
      { userId: "user-1", stopId: stop.id, ...goodEvidence, capturedAtMs: NOW.getTime() - 600_000 },
      deps,
      NOW
    );

    assert.equal(result.ok, false);
    assert.deepEqual(recorder.calls, []);
  });

  it("refuses a guest who is too far away", async () => {
    const stop = makeStop();
    const { deps, recorder } = gpsWorld([stop]);

    const result = await checkInStopWithGps(
      { userId: "user-1", stopId: stop.id, ...goodEvidence, latitude: 41.9, longitude: 45.1 },
      deps,
      NOW
    );

    assert.equal(result.ok, false);
    assert.deepEqual(recorder.calls, []);
  });

  it("refuses GPS on a QR-required stop", async () => {
    const stop = makeStop({ checkInMethod: "qr" });
    const { deps, recorder } = gpsWorld([stop]);

    const result = await checkInStopWithGps({ userId: "user-1", stopId: stop.id, ...goodEvidence }, deps, NOW);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "wrong_check_in_method");
    assert.deepEqual(recorder.calls, [], "an unverified visit is not a visit");
  });

  it("refuses a stop belonging to somebody else", async () => {
    const stop = makeStop();
    const { deps, recorder } = gpsWorld([stop]);

    const result = await checkInStopWithGps({ userId: "someone-else", stopId: stop.id, ...goodEvidence }, deps, NOW);

    assert.equal(result.ok, false);
    assert.deepEqual(recorder.calls, []);
  });

  it("refuses a later stop while an earlier one is unvisited", async () => {
    const first = makeStop({ id: "stop-1", position: 0 });
    const second = makeStop({ id: "stop-2", position: 1, placeId: "00000000-0000-4000-c000-0000000000bb" });
    const { deps, recorder } = gpsWorld([first, second]);

    const result = await checkInStopWithGps({ userId: "user-1", stopId: second.id, ...goodEvidence }, deps, NOW);

    assert.equal(result.ok, false);
    assert.deepEqual(recorder.calls, []);
  });

  it("refuses a stop whose Place is no longer eligible", async () => {
    const stop = makeStop();
    const { deps: base, recorder } = gpsWorld([stop]);

    const deps: CheckInDependencies = {
      ...base,
      // Nothing is eligible any more: the partnership was revoked mid-stay.
      loadAvailabilityContext: async () => ({
        stay: { id: "stay-1", hotelId: "hotel-1", dayNumber: 1 },
        eligiblePlaceIds: new Set<string>(),
      }),
    };

    const result = await checkInStopWithGps({ userId: "user-1", stopId: stop.id, ...goodEvidence }, deps, NOW);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "stop_unavailable");
    assert.deepEqual(recorder.calls, []);
  });
});

describe("the QR path behaves the same way", () => {
  const venue: Place = makeTestPlace({ id: PLACE_ID, category: "landmark" });

  function qrWorld(stop: ItineraryStop, validToken = "valid-token") {
    const recorder = createVisitRecorder();

    const deps: QrCheckInDependencies = {
      findPlaceByCheckInCredential: async (scanned) => (scanned === validToken ? venue : null),
      findActiveStayForUser: async () => ({
        id: "stay-1",
        checkIn: new Date("2026-03-10T08:00:00Z"),
        checkOut: null,
        hotel: { id: "hotel-1" } as Hotel,
        place: makeTestPlace({ category: "hotel" }),
      }),
      findItineraryDay: async () => makeDay(),
      listItineraryStops: async () => [stop],
      markStopVisited: async () => ({ stop: { ...stop, visitedAt: NOW }, dayCompleted: true }),
      recordVerifiedVisit: recorder.record,
      loadAvailabilityContext: loadAllAvailable,
    };

    return { deps, recorder };
  }

  it("records the visit on an accepted scan, as a qr verification", async () => {
    const stop = makeStop({ checkInMethod: "qr" });
    const { deps, recorder } = qrWorld(stop);

    const result = await checkInStopWithQr({ userId: "user-1", qrToken: "valid-token" }, NOW, deps);

    assert.equal(result.ok, true);
    assert.deepEqual(recorder.calls, [{ userId: "user-1", placeId: PLACE_ID, method: "qr" }]);
  });

  it("records nothing for an unrecognised code", async () => {
    const stop = makeStop({ checkInMethod: "qr" });
    const { deps, recorder } = qrWorld(stop);

    const result = await checkInStopWithQr({ userId: "user-1", qrToken: "not-a-real-code" }, NOW, deps);

    assert.equal(result.ok, false);
    assert.deepEqual(recorder.calls, []);
  });

  it("records nothing when a QR scan is used on a GPS-required stop", async () => {
    const stop = makeStop({ checkInMethod: "gps" });
    const { deps, recorder } = qrWorld(stop);

    const result = await checkInStopWithQr({ userId: "user-1", qrToken: "valid-token" }, NOW, deps);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "wrong_check_in_method");
    assert.deepEqual(recorder.calls, []);
  });
});
