import { test } from "node:test";
import assert from "node:assert/strict";
import type { Hotel, ItineraryDay, ItineraryStop, Place } from "@/db/schema";
import { loadAllAvailable, makeTestPlace } from "./test-utils";
import { getCurrentItineraryForUser, type CurrentItineraryDependencies } from "./current-itinerary";

const NOW = new Date("2026-03-10T12:00:00Z");

function makeHotel(placeId: string): Hotel {
  return {
    id: "hotel-1",
    placeId,
    qrToken: "hotel-qr",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}

function makeDay(overrides: Partial<ItineraryDay> = {}): ItineraryDay {
  return {
    id: "day-1",
    userId: "user-1",
    principalId: null,
    hotelId: "hotel-1",
    hotelStayId: "stay-1",
    dayNumber: 1,
    stopCount: 2,
    routeGeoJson: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[44.8, 41.7]] } },
    totalDurationSeconds: 3600,
    originalDurationSeconds: 3600,
    availableMinutes: null,
    generatedAt: new Date("2026-03-10T08:00:00Z"),
    completedAt: null,
    ...overrides,
  };
}

let stopCounter = 0;
function makeStop(overrides: Partial<ItineraryStop> = {}): ItineraryStop {
  stopCounter += 1;
  return {
    id: `stop-${stopCounter}`,
    dayId: "day-1",
    placeId: `place-${stopCounter}`,
    isHotelStop: false,
    checkInMethod: "gps",
    name: `Stop ${stopCounter}`,
    category: "restaurant",
    latitude: 41.7,
    longitude: 44.8,
    imageUrl: null,
    visitDurationMinutes: null,
    position: stopCounter,
    visitedAt: null,
    supersededAt: null,
    supersededReason: null,
    ...overrides,
  };
}

function buildDeps(options: {
  stay?: { checkIn: Date; checkOut: Date | null } | null;
  day?: ItineraryDay | null;
  stops?: ItineraryStop[];
}): CurrentItineraryDependencies {
  const hotelPlace: Place = makeTestPlace({ id: "hotel-place-1", category: "hotel", name: "Test Hotel" });
  const hotel = makeHotel(hotelPlace.id);
  const stay = options.stay === undefined ? { checkIn: new Date("2026-03-10T08:00:00Z"), checkOut: null } : options.stay;

  return {
    findActiveStayForUser: async () => (stay ? { id: "stay-1", checkIn: stay.checkIn, checkOut: stay.checkOut, hotel, place: hotelPlace } : null),
    findItineraryDay: async () => options.day ?? null,
    listItineraryStops: async () => options.stops ?? [],
    findPlaceIdsWithArTargets: async () => new Set<string>(),
    loadAvailabilityContext: loadAllAvailable,
  };
}

test("no active hotel stay -> no_active_stay", async () => {
  const deps = buildDeps({ stay: null });
  const result = await getCurrentItineraryForUser("user-1", NOW, deps);
  assert.deepEqual(result, { status: "no_active_stay" });
});

test("active stay but no itinerary generated yet -> no_itinerary_yet, with the hotel's name", async () => {
  const deps = buildDeps({ day: null });
  const result = await getCurrentItineraryForUser("user-1", NOW, deps);
  assert.equal(result.status, "no_itinerary_yet");
  if (result.status === "no_itinerary_yet") assert.equal(result.hotelName, "Test Hotel");
});

test("active stay + itinerary -> ready, with stops sorted and the route geometry validated", async () => {
  const stopA = makeStop({ position: 0, visitedAt: new Date("2026-03-10T09:00:00Z") });
  const stopB = makeStop({ position: 1 });
  const deps = buildDeps({ day: makeDay(), stops: [stopB, stopA] }); // deliberately out of order
  const result = await getCurrentItineraryForUser("user-1", NOW, deps);
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.stops[0].id, stopA.id, "stops are sorted by position regardless of input order");
    assert.equal(result.stops[1].id, stopB.id, "the completed stop and the current one are both revealed");
    // Progressive reveal: the saved round trip stays on the server. The map draws the
    // current leg from the directions action instead.
    assert.equal(result.routeGeometry, null, "the full route geometry is never sent to the guest");
  }
});

test("current stop is the first unvisited stop, derived via the exact same rule check-in.ts enforces", async () => {
  const stopA = makeStop({ position: 0, visitedAt: new Date() });
  const stopB = makeStop({ position: 1 });
  const stopC = makeStop({ position: 2 });
  const deps = buildDeps({ day: makeDay(), stops: [stopA, stopB, stopC] });
  const result = await getCurrentItineraryForUser("user-1", NOW, deps);
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.currentStop?.id, stopB.id);
    assert.equal(result.stops.find((s) => s.id === stopA.id)?.status, "completed");
    assert.equal(result.stops.find((s) => s.id === stopB.id)?.status, "current");
    // Route preview: the whole plan is shown, but only the first pending stop is ever "current".
    assert.equal(result.stops.find((s) => s.id === stopC.id)?.status, "upcoming");
    assert.equal(result.stops.length, 3);
  }
});

test("a selected later stop never becomes 'current' — only the first unvisited stop can be", async () => {
  // Simulates "the user tapped stop 3 on the map" — the service has no
  // concept of a client-selected stop at all, so there's nothing to resist;
  // this test documents that currentStop is purely server-derived.
  const stopA = makeStop({ position: 0 });
  const stopB = makeStop({ position: 1 });
  const deps = buildDeps({ day: makeDay(), stops: [stopA, stopB] });
  const result = await getCurrentItineraryForUser("user-1", NOW, deps);
  assert.equal(result.status, "ready");
  if (result.status === "ready") assert.equal(result.currentStop?.id, stopA.id);
});

test("an auto-visited hotel filler is reported as completed, never as current", async () => {
  const filler = makeStop({ position: 0, isHotelStop: true, checkInMethod: "auto", visitedAt: new Date() });
  const stopA = makeStop({ position: 1 });
  const deps = buildDeps({ day: makeDay(), stops: [filler, stopA] });
  const result = await getCurrentItineraryForUser("user-1", NOW, deps);
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.stops.find((s) => s.id === filler.id)?.status, "completed");
    assert.equal(result.currentStop?.id, stopA.id);
  }
});

test("a fully completed day reports currentStop: null and surfaces completedAt", async () => {
  const stopA = makeStop({ position: 0, visitedAt: new Date() });
  const deps = buildDeps({ day: makeDay({ completedAt: new Date("2026-03-10T10:00:00Z") }), stops: [stopA] });
  const result = await getCurrentItineraryForUser("user-1", NOW, deps);
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.currentStop, null);
    assert.notEqual(result.completedAt, null);
  }
});

test("a malformed routeGeoJson value is surfaced as null instead of being passed through unchecked", async () => {
  const deps = buildDeps({ day: makeDay({ routeGeoJson: { type: "LineString", coordinates: [] } }), stops: [] });
  const result = await getCurrentItineraryForUser("user-1", NOW, deps);
  assert.equal(result.status, "ready");
  if (result.status === "ready") assert.equal(result.routeGeometry, null);
});

test("this function never generates — it never calls anything beyond the three read-only dependencies", async () => {
  let callCount = 0;
  const base = buildDeps({ day: null });
  const deps: CurrentItineraryDependencies = {
    findActiveStayForUser: async (...args) => {
      callCount += 1;
      return base.findActiveStayForUser(...args);
    },
    findItineraryDay: base.findItineraryDay,
    listItineraryStops: base.listItineraryStops,
    findPlaceIdsWithArTargets: async () => new Set<string>(),
    loadAvailabilityContext: base.loadAvailabilityContext,
  };
  await getCurrentItineraryForUser("user-1", NOW, deps);
  assert.equal(callCount, 1, "exactly one read, no retries or hidden generation side effects");
});

// ---------------------------------------------------------------------------
// Layer 3: the guest is told how their time stands, honestly and in two parts.
// ---------------------------------------------------------------------------

test("the read model reports time left and what the plan needs as separate facts", async () => {
  const day = makeDay({
    availableMinutes: 180,
    // Generated an hour ago, so two of the three hours are left.
    generatedAt: new Date(NOW.getTime() - 60 * 60 * 1000),
    totalDurationSeconds: 1800,
  });
  const stops = [
    makeStop({ id: "s1", position: 0, visitDurationMinutes: 30 }),
    makeStop({ id: "s2", position: 1, visitDurationMinutes: 20 }),
  ];

  const result = await getCurrentItineraryForUser("user-1", NOW, buildDeps({ day, stops }));

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;

  assert.equal(result.availableMinutes, 180, "the window the guest originally asked for");
  assert.equal(result.time.remainingMinutes, 120, "measured from when the plan was generated");
  assert.equal(result.time.plannedMinutes, 80, "30 minutes of walking plus both pending visits");
  assert.equal(result.time.fitsRemaining, true);
});

test("an over-budget plan is flagged, and nothing is dropped to make it fit", async () => {
  const day = makeDay({
    availableMinutes: 120,
    // Most of the window is already gone.
    generatedAt: new Date(NOW.getTime() - 110 * 60 * 1000),
    totalDurationSeconds: 1800,
  });
  const stops = [
    makeStop({ id: "s1", position: 0, visitDurationMinutes: 45 }),
    makeStop({ id: "s2", position: 1, visitDurationMinutes: 45 }),
  ];

  const result = await getCurrentItineraryForUser("user-1", NOW, buildDeps({ day, stops }));

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;

  assert.equal(result.time.remainingMinutes, 10);
  assert.equal(result.time.fitsRemaining, false, "the guest is told plainly that it no longer fits");
  assert.equal(result.time.overBudgetByMinutes, 110);

  // The whole point: reporting an overrun must not quietly edit the plan.
  assert.equal(result.stops.length, 2, "both stops are still in the plan");
  assert.equal(result.stops.every((stop) => stop.status !== "unavailable"), true);
  assert.notEqual(result.currentStop, null, "the guest can still carry on with their day");
});

test("completed stops stop costing time, so finishing one improves the fit", async () => {
  const day = makeDay({
    availableMinutes: 120,
    generatedAt: new Date(NOW.getTime() - 30 * 60 * 1000),
    totalDurationSeconds: 1800,
  });

  const pending = await getCurrentItineraryForUser(
    "user-1",
    NOW,
    buildDeps({
      day,
      stops: [
        makeStop({ id: "s1", position: 0, visitDurationMinutes: 40 }),
        makeStop({ id: "s2", position: 1, visitDurationMinutes: 40 }),
      ],
    })
  );

  const oneDone = await getCurrentItineraryForUser(
    "user-1",
    NOW,
    buildDeps({
      day,
      stops: [
        makeStop({ id: "s1", position: 0, visitDurationMinutes: 40, visitedAt: new Date(NOW.getTime() - 10 * 60 * 1000) }),
        makeStop({ id: "s2", position: 1, visitDurationMinutes: 40 }),
      ],
    })
  );

  assert.equal(pending.status, "ready");
  assert.equal(oneDone.status, "ready");
  if (pending.status !== "ready" || oneDone.status !== "ready") return;

  assert.equal(pending.time.plannedMinutes - oneDone.time.plannedMinutes, 40);
});

test("a plan made before windows existed gets no verdict rather than a guessed one", async () => {
  const day = makeDay({ availableMinutes: null, totalDurationSeconds: 7200 });
  const stops = [makeStop({ id: "s1", position: 0, visitDurationMinutes: 60 })];

  const result = await getCurrentItineraryForUser("user-1", NOW, buildDeps({ day, stops }));

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;

  assert.equal(result.availableMinutes, null);
  assert.equal(result.time.remainingMinutes, null);
  assert.equal(result.time.fitsRemaining, null, "no window means no verdict, not 'does not fit'");
  assert.equal(result.time.plannedMinutes, 180, "what the plan asks for is still reported");
});

test("a stop with no saved duration is still counted as costing time, never zero", async () => {
  const day = makeDay({ availableMinutes: 120, totalDurationSeconds: 600 });
  const stops = [makeStop({ id: "s1", position: 0, visitDurationMinutes: null, category: "museum" })];

  const result = await getCurrentItineraryForUser("user-1", NOW, buildDeps({ day, stops }));

  assert.equal(result.status, "ready");
  if (result.status !== "ready") return;
  assert.ok(result.time.plannedMinutes > 10, "the walk alone is 10 minutes; the visit must add to it");
});
