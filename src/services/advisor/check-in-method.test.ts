import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Hotel, ItineraryDay, ItineraryStop, Place } from "@/db/schema";
import { checkInStopWithGps, type CheckInDependencies } from "./check-in";
import { checkInStopWithQr, type QrCheckInDependencies } from "./check-in-qr";
import { isCheckInMethodAllowed } from "./check-in-method";
import { fakeRecordVerifiedVisit, loadAllAvailable, makeTestPlace } from "./test-utils";

const PLACE_ID = "00000000-0000-4000-8000-0000000000aa";
const CLOCK = new Date("2026-03-10T10:00:00Z");
const AT_THE_STOP = { latitude: 41.7151, longitude: 44.8271, accuracyMeters: 10, capturedAtMs: CLOCK.getTime() };

describe("which method may complete a stop", () => {
  it("lets GPS complete a GPS stop and QR complete a QR stop", () => {
    assert.equal(isCheckInMethodAllowed("gps", "gps"), true);
    assert.equal(isCheckInMethodAllowed("qr", "qr"), true);
  });

  it("refuses GPS for a QR stop — the whole point of a partner's QR requirement", () => {
    assert.equal(isCheckInMethodAllowed("qr", "gps"), false);
  });

  it("refuses QR for a GPS stop", () => {
    assert.equal(isCheckInMethodAllowed("gps", "qr"), false);
  });

  it("accepts either method for a legacy 'auto' stop, which nothing writes but the column allows", () => {
    assert.equal(isCheckInMethodAllowed("auto", "gps"), true);
    assert.equal(isCheckInMethodAllowed("auto", "qr"), true);
  });
});

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
    availableMinutes: null,
    generatedAt: new Date("2026-03-10T08:00:00Z"),
    completedAt: null,
  };
}

function makeStop(checkInMethod: ItineraryStop["checkInMethod"]): ItineraryStop {
  return {
    id: "stop-1",
    dayId: "day-1",
    placeId: PLACE_ID,
    isHotelStop: false,
    checkInMethod,
    name: "Partner gallery",
    category: "landmark",
    latitude: AT_THE_STOP.latitude,
    longitude: AT_THE_STOP.longitude,
    imageUrl: null,
    visitDurationMinutes: null,
    position: 1,
    visitedAt: null,
    supersededAt: null,
    supersededReason: null,
  };
}

/** Records every write so a refusal can be asserted to have written nothing at all. */
function gpsDeps(stop: ItineraryStop) {
  const writes: string[] = [];
  const deps: CheckInDependencies = {
    findItineraryStopWithDay: async () => ({ stop, day: makeDay() }),
    listItineraryStops: async () => [stop],
    markStopVisited: async (stopId) => {
      writes.push(stopId);
      return { stop: { ...stop, visitedAt: new Date() }, dayCompleted: true };
    },
    recordVerifiedVisit: fakeRecordVerifiedVisit,
    loadAvailabilityContext: loadAllAvailable,
  };
  return { deps, writes };
}

function qrDeps(stop: ItineraryStop, place: Place) {
  const writes: string[] = [];
  const deps: QrCheckInDependencies = {
    findPlaceByCheckInCredential: async (scanned) => (scanned === "valid-token" ? place : null),
    findActiveStayForUser: async () => ({
      id: "stay-1",
      checkIn: new Date("2026-03-10T00:00:00Z"),
      checkOut: null,
      hotel: { id: "hotel-1" } as Hotel,
      place: makeTestPlace({ category: "hotel" }),
    }),
    findItineraryDay: async () => makeDay(),
    listItineraryStops: async () => [stop],
    markStopVisited: async (stopId) => {
      writes.push(stopId);
      return { stop: { ...stop, visitedAt: new Date() }, dayCompleted: true };
    },
    recordVerifiedVisit: fakeRecordVerifiedVisit,
    loadAvailabilityContext: loadAllAvailable,
  };
  return { deps, writes };
}

describe("GPS check-in against the stop's saved method", () => {
  it("refuses a QR stop, and writes nothing", async () => {
    const stop = makeStop("qr");
    const { deps, writes } = gpsDeps(stop);

    const result = await checkInStopWithGps(
      { userId: "user-1", stopId: stop.id, ...AT_THE_STOP },
      deps,
      new Date("2026-03-10T10:00:00Z")
    );

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "wrong_check_in_method");
    assert.deepEqual(writes, []);
  });

  it("still completes a GPS stop", async () => {
    const stop = makeStop("gps");
    const { deps, writes } = gpsDeps(stop);

    const result = await checkInStopWithGps(
      { userId: "user-1", stopId: stop.id, ...AT_THE_STOP },
      deps,
      new Date("2026-03-10T10:00:00Z")
    );

    assert.equal(result.ok, true);
    assert.deepEqual(writes, [stop.id]);
  });

  it("refuses the QR stop even when the guest is standing exactly on it", async () => {
    const stop = makeStop("qr");
    const { deps } = gpsDeps(stop);

    const result = await checkInStopWithGps(
      { userId: "user-1", stopId: stop.id, latitude: stop.latitude, longitude: stop.longitude, accuracyMeters: 10, capturedAtMs: CLOCK.getTime() },
      deps,
      new Date("2026-03-10T10:00:00Z")
    );

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "wrong_check_in_method");
  });
});

describe("QR check-in against the stop's saved method", () => {
  const place = makeTestPlace({ id: PLACE_ID, category: "landmark" });

  it("refuses a GPS stop even with a genuine, valid code for that Place, and writes nothing", async () => {
    const stop = makeStop("gps");
    const { deps, writes } = qrDeps(stop, place);

    const result = await checkInStopWithQr(
      { userId: "user-1", qrToken: "valid-token" },
      new Date("2026-03-10T10:00:00Z"),
      deps
    );

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "wrong_check_in_method");
    assert.deepEqual(writes, []);
  });

  it("still completes a QR stop", async () => {
    const stop = makeStop("qr");
    const { deps, writes } = qrDeps(stop, place);

    const result = await checkInStopWithQr(
      { userId: "user-1", qrToken: "valid-token" },
      new Date("2026-03-10T10:00:00Z"),
      deps
    );

    assert.equal(result.ok, true);
    assert.deepEqual(writes, [stop.id]);
  });
});

describe("the saved requirement survives the visit", () => {
  it("records the visit without being handed a method to write", async () => {
    const stop = makeStop("qr");
    const seen: unknown[][] = [];
    const deps: QrCheckInDependencies = {
      ...qrDeps(stop, makeTestPlace({ id: PLACE_ID, category: "landmark" })).deps,
      markStopVisited: async (...args) => {
        seen.push(args);
        return { stop: { ...stop, visitedAt: new Date() }, dayCompleted: true };
      },
    };

    await checkInStopWithQr({ userId: "user-1", qrToken: "valid-token" }, new Date("2026-03-10T10:00:00Z"), deps);

    // Two arguments only: stopId and dayId. A third (the method) is what used to
    // overwrite the stop's requirement with whatever had just succeeded.
    assert.equal(seen.length, 1);
    assert.equal(seen[0].length, 2);
  });
});

describe("daily plan stops: QR or location", () => {
  it("accept a QR scan, a location check-in, or the stronger camera match", () => {
    assert.equal(isCheckInMethodAllowed("qr_or_gps", "qr"), true);
    assert.equal(isCheckInMethodAllowed("qr_or_gps", "gps"), true);
    assert.equal(isCheckInMethodAllowed("qr_or_gps", "ar"), true);
  });

  it("a QR-only stop still refuses a location check-in", () => {
    assert.equal(isCheckInMethodAllowed("qr", "gps"), false);
  });
});
