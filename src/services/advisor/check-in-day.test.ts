import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { ItineraryDay, ItineraryStop } from "@/db/schema";
import { checkInStopWithGps, type CheckInDependencies } from "./check-in";
import { checkInStopWithQr, type QrCheckInDependencies } from "./check-in-qr";
import { contextFromEligible, type AvailabilityContextLoader } from "./stop-availability";
import { makeTestPlace } from "./test-utils";

/**
 * WHICH DAY CAN BE CHECKED IN: only the guest's CURRENT day of their own current stay, computed on the server
 * from the stay dates and the server clock. Earlier days (even of the same stay), future days, other stays and
 * other hotels are refused with NO write. A client-supplied date is never read.
 */

// Fixed ids and times: nothing depends on counters, randomness or test order.
const STAY_CHECK_IN = new Date("2026-06-13T08:00:00Z"); // day 1 = 13 June
const DAY_3_NOON = new Date("2026-06-15T12:00:00Z"); // current day = 3
const DAY_4_NOON = new Date("2026-06-16T12:00:00Z"); // after midnight: current day = 4
const USER = "00000000-0000-4000-8000-000000000001";
const STAY = "00000000-0000-4000-8000-0000000000a1";
const OTHER_STAY = "00000000-0000-4000-8000-0000000000a2";
const HOTEL = "00000000-0000-4000-8000-0000000000b1";
const OTHER_HOTEL = "00000000-0000-4000-8000-0000000000b2";
const DAY_1 = "00000000-0000-4000-8000-0000000000c1";
const DAY_3 = "00000000-0000-4000-8000-0000000000c3";
const DAY_4 = "00000000-0000-4000-8000-0000000000c4";
const PLACE = "00000000-0000-4000-8000-0000000000d1";
const STOP_OLD = "00000000-0000-4000-8000-0000000000e1";
const STOP_TODAY = "00000000-0000-4000-8000-0000000000e3";
const STOP_FUTURE = "00000000-0000-4000-8000-0000000000e4";
const HERE = { latitude: 41.7151, longitude: 44.8271 };

const day = (id: string, dayNumber: number, overrides: Partial<ItineraryDay> = {}): ItineraryDay => ({
  id,
  userId: USER,
  hotelId: HOTEL,
  hotelStayId: STAY,
  dayNumber,
  stopCount: 1,
  routeGeoJson: null,
  totalDurationSeconds: 1800,
  originalDurationSeconds: 1800,
  generatedAt: new Date(`2026-06-${12 + dayNumber}T08:00:00Z`),
  completedAt: null,
  ...overrides,
});

const stop = (id: string, dayId: string, overrides: Partial<ItineraryStop> = {}): ItineraryStop => ({
  id,
  dayId,
  placeId: PLACE,
  isHotelStop: false,
  checkInMethod: "gps",
  name: "Saved stop",
  category: "restaurant",
  latitude: HERE.latitude,
  longitude: HERE.longitude,
  imageUrl: null,
  position: 0,
  visitedAt: null,
  supersededAt: null,
  supersededReason: null,
  ...overrides,
});

type World = {
  days: ItineraryDay[];
  stops: ItineraryStop[];
  /** What the (server-side) stay looks like. Overridable per test. */
  stay: { id: string; hotelId: string; checkIn: Date; checkOut: Date | null } | null;
  /** The server clock the loader and the service see; can be advanced mid-call to simulate midnight. */
  clock: Date;
  writes: string[];
  loads: number;
  onLoad?: (call: number) => void;
};

function build(overrides: Partial<World> = {}) {
  const w: World = {
    days: [day(DAY_1, 1), day(DAY_3, 3), day(DAY_4, 4)],
    stops: [stop(STOP_OLD, DAY_1), stop(STOP_TODAY, DAY_3), stop(STOP_FUTURE, DAY_4)],
    stay: { id: STAY, hotelId: HOTEL, checkIn: STAY_CHECK_IN, checkOut: null },
    clock: DAY_3_NOON,
    writes: [],
    loads: 0,
    ...overrides,
  };

  // The loader derives the current day from the stay dates and the SERVER clock (the `now` the service passes).
  const loadAvailabilityContext: AvailabilityContextLoader = async (_userId, now) => {
    w.loads += 1;
    w.onLoad?.(w.loads);
    const at = w.loads >= 2 && w.clock !== DAY_3_NOON ? w.clock : now;
    return contextFromEligible(
      w.stay ? { id: w.stay.id, hotel: { id: w.stay.hotelId }, checkIn: w.stay.checkIn, checkOut: w.stay.checkOut } : null,
      [{ place: { id: PLACE } as never }],
      at
    );
  };

  const activeStops = (dayId: string) => w.stops.filter((s) => s.dayId === dayId && s.supersededAt === null).sort((a, b) => a.position - b.position);
  const markStopVisited: CheckInDependencies["markStopVisited"] = async (id, dayId, method) => {
    w.writes.push(id);
    const target = w.stops.find((s) => s.id === id)!;
    const visited = { ...target, visitedAt: w.clock, checkInMethod: method };
    w.stops = w.stops.map((s) => (s.id === id ? visited : s));
    return { stop: visited, dayCompleted: activeStops(dayId).every((s) => s.visitedAt !== null) };
  };

  const gpsDeps: CheckInDependencies = {
    findItineraryStopWithDay: async (id) => {
      const found = w.stops.find((s) => s.id === id && s.supersededAt === null);
      const d = found ? w.days.find((x) => x.id === found.dayId) : undefined;
      return found && d ? { stop: found, day: d } : null;
    },
    listItineraryStops: async (dayId) => activeStops(dayId),
    markStopVisited,
    loadAvailabilityContext,
  };

  const qrDeps: QrCheckInDependencies = {
    findPlaceByQrToken: async (token) => (token === "qr-place" ? makeTestPlace({ id: PLACE, category: "restaurant", qrToken: "qr-place" }) : null),
    findActiveStayForUser: async () =>
      w.stay
        ? {
            id: w.stay.id,
            checkIn: w.stay.checkIn,
            checkOut: w.stay.checkOut,
            hotel: { id: w.stay.hotelId, placeId: "hotel-place", qrToken: "x", createdAt: DAY_3_NOON, updatedAt: DAY_3_NOON },
            place: makeTestPlace({ id: "hotel-place", category: "hotel" }),
          }
        : null,
    // The REAL lookup keys off the server-computed current day number.
    findItineraryDay: async (_userId, hotelId, dayNumber) => w.days.find((d) => d.hotelId === hotelId && d.dayNumber === dayNumber) ?? null,
    listItineraryStops: async (dayId) => activeStops(dayId),
    markStopVisited,
    loadAvailabilityContext,
  };

  return { w, gpsDeps, qrDeps };
}

describe("GPS check-in: which day can be checked in", () => {
  test("a stop of the guest's CURRENT day is checkable", async () => {
    const { w, gpsDeps } = build();
    const result = await checkInStopWithGps({ userId: USER, stopId: STOP_TODAY, ...HERE }, gpsDeps, DAY_3_NOON);
    assert.equal(result.ok, true);
    assert.deepEqual(w.writes, [STOP_TODAY]);
  });

  test("a pending stop of an EARLIER day of the SAME stay is refused (wrong_day) and nothing is written", async () => {
    const { w, gpsDeps } = build();
    const result = await checkInStopWithGps({ userId: USER, stopId: STOP_OLD, ...HERE }, gpsDeps, DAY_3_NOON);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "wrong_day");
    assert.deepEqual(w.writes, [], "no write");
  });

  test("a stop of a FUTURE day is refused (wrong_day) and nothing is written", async () => {
    const { w, gpsDeps } = build();
    const result = await checkInStopWithGps({ userId: USER, stopId: STOP_FUTURE, ...HERE }, gpsDeps, DAY_3_NOON);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "wrong_day");
    assert.deepEqual(w.writes, []);
  });

  test("a day that belongs to ANOTHER stay, ANOTHER hotel, or no stay at all is refused with no write", async () => {
    const variants: Array<[string, Partial<ItineraryDay>]> = [
      ["another stay", { hotelStayId: OTHER_STAY }],
      ["another hotel", { hotelId: OTHER_HOTEL }],
      ["no stay on the day", { hotelStayId: null }],
    ];
    for (const [label, change] of variants) {
      const { w, gpsDeps } = build({ days: [day(DAY_3, 3, change)], stops: [stop(STOP_TODAY, DAY_3)] });
      const result = await checkInStopWithGps({ userId: USER, stopId: STOP_TODAY, ...HERE }, gpsDeps, DAY_3_NOON);
      assert.equal(result.ok, false, label);
      if (!result.ok) assert.equal(result.reason, "stop_unavailable", label);
      assert.deepEqual(w.writes, [], label);
    }
  });

  test("a guest whose stay has ended or has not started has no current day: refused, no write", async () => {
    const ended = build({ stay: { id: STAY, hotelId: HOTEL, checkIn: STAY_CHECK_IN, checkOut: new Date("2026-06-14T10:00:00Z") } });
    const notStarted = build({ stay: { id: STAY, hotelId: HOTEL, checkIn: new Date("2026-06-20T08:00:00Z"), checkOut: null } });
    const noStay = build({ stay: null });
    for (const [label, world] of [["ended", ended], ["not started", notStarted], ["no stay", noStay]] as const) {
      const result = await checkInStopWithGps({ userId: USER, stopId: STOP_TODAY, ...HERE }, world.gpsDeps, DAY_3_NOON);
      assert.equal(result.ok, false, label);
      assert.deepEqual(world.w.writes, [], label);
    }
  });

  test("after midnight yesterday's route is no longer checkable: the server clock decides, not the client", async () => {
    const { w, gpsDeps } = build();
    // Same stop, same request; only the SERVER clock moved to the next day.
    const result = await checkInStopWithGps({ userId: USER, stopId: STOP_TODAY, ...HERE }, gpsDeps, DAY_4_NOON);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "wrong_day");
    assert.deepEqual(w.writes, []);
  });

  test("a client-supplied date, day number, 'now' or day id is never read: forging them cannot make an earlier day checkable", async () => {
    const { w, gpsDeps } = build();
    const forged = {
      userId: USER,
      stopId: STOP_OLD,
      ...HERE,
      date: "2026-06-13",
      dayNumber: 3,
      now: DAY_3_NOON,
      dayId: DAY_3,
      hotelStayId: STAY,
    } as unknown as Parameters<typeof checkInStopWithGps>[0];
    const result = await checkInStopWithGps(forged, gpsDeps, DAY_3_NOON);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "wrong_day");
    assert.deepEqual(w.writes, []);
  });

  test("the day is re-verified immediately before the write: if the day rolls over between the checks, nothing is written", async () => {
    const { w, gpsDeps } = build();
    // First load (early decision) sees day 3; the second (just before the write) happens after midnight -> day 4.
    w.clock = DAY_4_NOON;
    const result = await checkInStopWithGps({ userId: USER, stopId: STOP_TODAY, ...HERE }, gpsDeps, DAY_3_NOON);
    assert.equal(w.loads, 2, "checked twice: to decide, then right before the write");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "stop_unavailable");
    assert.deepEqual(w.writes, []);
  });

  test("a COMPLETED stop of an earlier day is history: re-submitting it is the existing idempotent success with no write", async () => {
    const { w, gpsDeps } = build({ stops: [stop(STOP_OLD, DAY_1, { visitedAt: new Date("2026-06-13T10:00:00Z") })] });
    const result = await checkInStopWithGps({ userId: USER, stopId: STOP_OLD, ...HERE }, gpsDeps, DAY_3_NOON);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.alreadyVisited, true);
    assert.deepEqual(w.writes, []);
    assert.equal(w.loads, 0);
  });
});

describe("QR check-in: which day can be checked in", () => {
  test("the scanned Place is matched ONLY against the guest's current day: a stop that exists only on an earlier day is not found, nothing written", async () => {
    // Today (day 3) has no stop for this Place; day 1 does.
    const { w, qrDeps } = build({ days: [day(DAY_1, 1), day(DAY_3, 3)], stops: [stop(STOP_OLD, DAY_1, { checkInMethod: "qr" }), stop(STOP_TODAY, DAY_3, { placeId: "00000000-0000-4000-8000-0000000000d9", checkInMethod: "qr" })] });
    const result = await checkInStopWithQr({ userId: USER, qrToken: "qr-place" }, DAY_3_NOON, qrDeps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "place_not_next");
    assert.deepEqual(w.writes, []);
  });

  test("a guest with no itinerary for TODAY gets no_active_itinerary even though an earlier day exists; nothing written", async () => {
    const { w, qrDeps } = build({ days: [day(DAY_1, 1)], stops: [stop(STOP_OLD, DAY_1, { checkInMethod: "qr" })] });
    const result = await checkInStopWithQr({ userId: USER, qrToken: "qr-place" }, DAY_3_NOON, qrDeps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_active_itinerary");
    assert.deepEqual(w.writes, []);
  });

  test("defence in depth: even if the day lookup ever returned an EARLIER day, it is refused (wrong_day) and nothing is written", async () => {
    const { w, qrDeps } = build({ days: [day(DAY_1, 1)], stops: [stop(STOP_OLD, DAY_1, { checkInMethod: "qr" })] });
    const buggyDeps: QrCheckInDependencies = { ...qrDeps, findItineraryDay: async () => day(DAY_1, 1) };
    const result = await checkInStopWithQr({ userId: USER, qrToken: "qr-place" }, DAY_3_NOON, buggyDeps);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "wrong_day");
    assert.deepEqual(w.writes, []);
  });

  test("a stop of the CURRENT day is checkable by QR", async () => {
    const { w, qrDeps } = build({ days: [day(DAY_3, 3)], stops: [stop(STOP_TODAY, DAY_3, { checkInMethod: "qr" })] });
    const result = await checkInStopWithQr({ userId: USER, qrToken: "qr-place" }, DAY_3_NOON, qrDeps);
    assert.equal(result.ok, true);
    assert.deepEqual(w.writes, [STOP_TODAY]);
  });

  test("after midnight the previous day's QR stop can no longer be checked in", async () => {
    const { w, qrDeps } = build({ days: [day(DAY_3, 3)], stops: [stop(STOP_TODAY, DAY_3, { checkInMethod: "qr" })] });
    const result = await checkInStopWithQr({ userId: USER, qrToken: "qr-place" }, DAY_4_NOON, qrDeps);
    assert.equal(result.ok, false);
    assert.deepEqual(w.writes, []);
  });

  test("the day is re-verified immediately before the write on the QR path too", async () => {
    const { w, qrDeps } = build({ days: [day(DAY_3, 3)], stops: [stop(STOP_TODAY, DAY_3, { checkInMethod: "qr" })] });
    w.clock = DAY_4_NOON;
    const result = await checkInStopWithQr({ userId: USER, qrToken: "qr-place" }, DAY_3_NOON, qrDeps);
    assert.equal(w.loads, 2);
    assert.equal(result.ok, false);
    assert.deepEqual(w.writes, []);
  });
});
