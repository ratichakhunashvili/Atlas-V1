import { test } from "node:test";
import assert from "node:assert/strict";
import type { Hotel, ItineraryDay, ItineraryStop, Place, User } from "@/db/schema";
import type { OptimizedRoute, RoutingResult } from "@/services/routing";
import type { EligiblePlace } from "@/services/eligibility/rules";
import { computeDayCompletedAt } from "./plan-state";
import { generateItineraryForUser, type GenerateItineraryDependencies } from "./generate-itinerary";

let placeCounter = 0;
function makePlace(overrides: Partial<Place> = {}): Place {
  placeCounter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(placeCounter).padStart(12, "0")}`,
    name: `Place ${placeCounter}`,
    description: null,
    latitude: 41.715 + placeCounter * 0.001,
    longitude: 44.827 + placeCounter * 0.001,
    category: "restaurant",
    address: null,
    imageUrl: null,
    website: null,
    phone: null,
    qrToken: null,
    visitDurationMinutes: 10,
    priceLevel: null,
    priceLevelSource: null,
    priceLevelVerifiedAt: null,
    archivedAt: null,
    publicationStatus: "published",
    publishedAt: new Date("2026-01-01T00:00:00Z"),
    verificationStatus: "verified",
    verifiedAt: new Date("2026-01-01T00:00:00Z"),
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "guest@example.com",
    passwordHash: "hash",
    role: "user",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function makeHotel(placeId: string, overrides: Partial<Hotel> = {}): Hotel {
  return {
    id: "hotel-1",
    placeId,
    qrToken: "hotel-qr-token",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

function emptyGeometry(): OptimizedRoute["geometry"] {
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } };
}

function routeWithOrder(order: number[]): RoutingResult<OptimizedRoute> {
  return {
    ok: true,
    route: { order, geometry: emptyGeometry(), totalDistanceMeters: 1000, totalDurationSeconds: 3600, legs: [] },
  };
}

function identityRoute(stopCount: number): RoutingResult<OptimizedRoute> {
  return routeWithOrder(Array.from({ length: stopCount }, (_, i) => i));
}

/** An in-memory stand-in for db/queries/itinerary.ts, conforming to the same contract persistItinerary/findItineraryDay/etc. expose — lets a test drive generateItineraryForUser through realistic multi-call sequences (create, then cooldown-check, then rebuild) with no real DB. */
function createFakeItineraryStore() {
  const days: ItineraryDay[] = [];
  let stops: ItineraryStop[] = [];
  let dayIdCounter = 0;
  let stopIdCounter = 0;

  const findItineraryDay: GenerateItineraryDependencies["findItineraryDay"] = async (userId, hotelId, dayNumber) =>
    days.find((d) => d.userId === userId && d.hotelId === hotelId && d.dayNumber === dayNumber) ?? null;

  const findLatestItineraryDayBefore: GenerateItineraryDependencies["findLatestItineraryDayBefore"] = async (
    userId,
    hotelId,
    beforeDayNumber
  ) => {
    const matches = days.filter((d) => d.userId === userId && d.hotelId === hotelId && d.dayNumber < beforeDayNumber);
    if (matches.length === 0) return null;
    return matches.reduce((a, b) => (a.dayNumber > b.dayNumber ? a : b));
  };

  // The ACTIVE plan only (superseded rows are history), like db/queries/itinerary.ts.
  const listItineraryStops: GenerateItineraryDependencies["listItineraryStops"] = async (dayId) =>
    stops.filter((s) => s.dayId === dayId && s.supersededAt === null).sort((a, b) => a.position - b.position);

  /** Every row of a day including superseded history — what the real listAllItineraryStops returns. */
  const listAllStops = (dayId: string) => stops.filter((s) => s.dayId === dayId).sort((a, b) => a.position - b.position);

  const getStopUsageHistory: GenerateItineraryDependencies["getStopUsageHistory"] = async (userId, hotelId) => {
    const history = new Map<string, number>();
    for (const day of days.filter((d) => d.userId === userId && d.hotelId === hotelId)) {
      for (const stop of stops.filter((s) => s.dayId === day.id && s.supersededAt === null)) {
        if (!stop.placeId) continue;
        const existing = history.get(stop.placeId);
        if (existing === undefined || day.dayNumber > existing) history.set(stop.placeId, day.dayNumber);
      }
    }
    return history;
  };

  const persistItinerary: GenerateItineraryDependencies["persistItinerary"] = async (input) => {
    if (!input.existingDayId) {
      const conflict = days.some((d) => d.userId === input.userId && d.hotelId === input.hotelId && d.dayNumber === input.dayNumber);
      if (conflict) return { status: "conflict" };
    }

    let day: ItineraryDay;
    if (input.existingDayId) {
      const dayId = input.existingDayId;
      // Mirrors the real in-place rebuild: NOTHING is deleted; only PENDING active stops are superseded.
      stops = stops.map((s) =>
        s.dayId === dayId && s.visitedAt === null && s.supersededAt === null
          ? { ...s, supersededAt: input.generatedAt, supersededReason: "plan_regenerated" as const }
          : s
      );
      const maxPosition = Math.max(-1, ...stops.filter((s) => s.dayId === dayId).map((s) => s.position));
      const added: ItineraryStop[] = input.stops.map((stop, i) => {
        stopIdCounter += 1;
        return { id: `stop-${stopIdCounter}`, dayId, position: maxPosition + 1 + i, supersededAt: null, supersededReason: null, ...stop };
      });
      stops.push(...added);
      const index = days.findIndex((d) => d.id === dayId);
      const active = stops.filter((s) => s.dayId === dayId && s.supersededAt === null);
      day = {
        ...days[index],
        stopCount: active.length,
        routeGeoJson: input.routeGeoJson as ItineraryDay["routeGeoJson"],
        totalDurationSeconds: input.totalDurationSeconds,
        originalDurationSeconds: input.totalDurationSeconds,
        availableMinutes: null,
        generatedAt: input.generatedAt,
        completedAt: computeDayCompletedAt(active, days[index].completedAt, input.generatedAt),
      };
      days[index] = day;
      return { status: "updated", day, stops: active.sort((a, b) => a.position - b.position) };
    } else {
      dayIdCounter += 1;
      day = {
        id: `day-${dayIdCounter}`,
        userId: input.userId,
        principalId: null,
        hotelId: input.hotelId,
        hotelStayId: input.hotelStayId,
        dayNumber: input.dayNumber,
        stopCount: input.stops.length,
        routeGeoJson: input.routeGeoJson as ItineraryDay["routeGeoJson"],
        totalDurationSeconds: input.totalDurationSeconds,
        originalDurationSeconds: input.totalDurationSeconds,
        availableMinutes: null,
        generatedAt: input.generatedAt,
        completedAt: input.completedAt,
      };
      days.push(day);
    }

    const newStops: ItineraryStop[] = input.stops.map((stop, i) => {
      stopIdCounter += 1;
      return { id: `stop-${stopIdCounter}`, dayId: day.id, position: i, supersededAt: null, supersededReason: null, ...stop };
    });
    stops.push(...newStops);

    return { status: "created", day, stops: newStops };
  };

  /** Test setup only — seeds a day directly so a "cooldown expired" scenario can be constructed without two real-time-spaced calls (impossible under calendar-accurate dayNumbers; see stay-day.test.ts). */
  function seedDay(day: ItineraryDay, dayStops: ItineraryStop[] = []) {
    days.push(day);
    stops.push(...dayStops);
  }

  return {
    findItineraryDay,
    listAllStops,
    findLatestItineraryDayBefore,
    listItineraryStops,
    getStopUsageHistory,
    persistItinerary,
    seedDay,
  };
}

type BuildDepsOptions = {
  user?: User;
  hotelPlace?: Place;
  eligiblePlaces?: Place[];
  partnerRelations?: Array<{ hotelId: string; placeId: string; priority: number | null; createdAt: Date; place: Place }>;
  preferences?: { categories: string[] } | null;
  route?: RoutingResult<OptimizedRoute> | ((stopCount: number) => RoutingResult<OptimizedRoute>);
  store?: ReturnType<typeof createFakeItineraryStore>;
  checkIn?: Date;
  checkOut?: Date | null;
};

function buildDeps(options: BuildDepsOptions = {}) {
  const user = options.user ?? makeUser();
  const hotelPlace = options.hotelPlace ?? makePlace({ category: "hotel", name: "Test Hotel" });
  const hotel = makeHotel(hotelPlace.id);
  const store = options.store ?? createFakeItineraryStore();
  let routeCallCount = 0;

  const optimizeWalkingRoute: GenerateItineraryDependencies["optimizeWalkingRoute"] = async (input) => {
    routeCallCount += 1;
    if (typeof options.route === "function") return options.route(input.stops.length);
    return options.route ?? identityRoute(input.stops.length);
  };

  const deps: GenerateItineraryDependencies = {
    findUserById: async (id) => (id === user.id ? user : null),
    findActiveStayForUser: async (userId) =>
      userId === user.id
        ? {
            id: "stay-1",
            checkIn: options.checkIn ?? new Date("2026-03-10T08:00:00Z"),
            checkOut: options.checkOut ?? null,
            hotel,
            place: hotelPlace,
          }
        : null,
    findPreferencesForUser: async () =>
      options.preferences === undefined
        ? { userId: user.id, principalId: null, categories: ["restaurant", "landmark"], budget: null, activityLevel: null, maxDistanceMeters: null, updatedAt: new Date() }
        : options.preferences === null
          ? null
          : { userId: user.id, principalId: null, categories: options.preferences.categories, budget: null, activityLevel: null, maxDistanceMeters: null, updatedAt: new Date() },
    // The (fake) eligibility service: returns ONLY what a hotel is eligible for. `eligiblePlaces` are the hotel's
    // eligible Places; any that also appear in `partnerRelations` are external partners (with that priority),
    // the rest are hotel-owned facilities. Real eligibility rules are covered in services/eligibility/*.test.ts.
    listEligiblePlacesForStay: async () => {
      const partnerById = new Map((options.partnerRelations ?? []).map((relation) => [relation.placeId, relation]));
      const entries: EligiblePlace[] = (options.eligiblePlaces ?? []).map((place) => {
        const relation = partnerById.get(place.id);
        return relation
          ? { place, source: "partner", relationId: `partnership-${place.id}`, priority: relation.priority, facilityType: null }
          : { place, source: "facility", relationId: `facility-${place.id}`, priority: null, facilityType: "other" };
      });
      for (const relation of options.partnerRelations ?? []) {
        if (entries.some((entry) => entry.place.id === relation.placeId)) continue;
        entries.push({ place: relation.place, source: "partner", relationId: `partnership-${relation.placeId}`, priority: relation.priority, facilityType: null });
      }
      return entries;
    },
    findItineraryDay: store.findItineraryDay,
    findLatestItineraryDayBefore: store.findLatestItineraryDayBefore,
    listItineraryStops: store.listItineraryStops,
    getStopUsageHistory: store.getStopUsageHistory,
    persistItinerary: store.persistItinerary,
    getWalkingRouteInOrder: async () => ({ ok: true as const, route: { geometry: emptyGeometry(), durationSeconds: 600, distanceMeters: 500 } }),
    listUpcomingHotelEvents: async () => [],
    optimizeWalkingRoute,
  };

  return { deps, user, hotel, hotelPlace, store, getRouteCallCount: () => routeCallCount };
}

const NOW = new Date("2026-03-10T12:00:00Z");

test("no active hotel stay fails with no_active_stay", async () => {
  const { deps } = buildDeps();
  const result = await generateItineraryForUser("someone-else", NOW, deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "no_active_stay");
});

test("a stay that hasn't started yet fails with outside_stay_period", async () => {
  const { deps, user } = buildDeps({ checkIn: new Date("2026-03-11T00:00:00Z") });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "outside_stay_period");
});

test("non-admin with no preferences is blocked", async () => {
  const { deps, user } = buildDeps({ preferences: { categories: [] } });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "no_preferences");
});

test("admin with no preferences gets the unfiltered pool instead of being blocked", async () => {
  const nearby = [makePlace({ category: "museum" })];
  const { deps, user } = buildDeps({
    user: makeUser({ role: "admin" }),
    preferences: { categories: [] },
    eligiblePlaces: nearby,
  });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    // The unfiltered pool still only contains ELIGIBLE places; the hotel itself is never added as a stop.
    assert.equal(result.itinerary.stops.length, 1);
    assert.equal(result.itinerary.stops[0].placeId, nearby[0].id);
    assert.equal(result.itinerary.stops.some((s) => s.isHotelStop), false);
  }
});

test("no eligible experiences returns a clear no_eligible_experiences result, persists nothing, and adds no hotel stop", async () => {
  const { deps, user, hotelPlace, store, getRouteCallCount } = buildDeps({ eligiblePlaces: [] });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "no_eligible_experiences");
    assert.match(result.message, new RegExp(hotelPlace.name));
    assert.match(result.message, /approved facilities or partners/);
  }
  assert.equal(await store.findItineraryDay(user.id, "hotel-1", 1), null, "no empty day is saved");
  assert.equal(getRouteCallCount(), 0, "no routing call is made for an empty plan");
});

test("eligible places that match none of the guest's interests also return no_eligible_experiences, with a different message", async () => {
  const { deps, user } = buildDeps({ eligiblePlaces: [makePlace({ category: "museum" })], preferences: { categories: ["restaurant"] } });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "no_eligible_experiences");
    assert.match(result.message, /match your interests/);
  }
});

test("a generated day is never auto-completed: every stop starts unvisited and none is an auto check-in", async () => {
  const nearby = [makePlace({ category: "restaurant" }), makePlace({ category: "restaurant" })];
  const { deps, user } = buildDeps({ eligiblePlaces: nearby, preferences: { categories: ["restaurant"] } });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.itinerary.stops.length, 2);
    assert.equal(result.itinerary.day.completedAt, null);
    for (const stop of result.itinerary.stops) {
      assert.equal(stop.visitedAt, null);
      assert.equal(stop.isHotelStop, false);
      assert.notEqual(stop.checkInMethod, "auto");
    }
  }
});

test("the hotel is the route origin and return point but never a stop", async () => {
  const nearby = [makePlace({ category: "restaurant" }), makePlace({ category: "restaurant" })];
  const { deps, user, hotelPlace } = buildDeps({ eligiblePlaces: nearby, preferences: { categories: ["restaurant"] } });
  const calls: Array<Parameters<GenerateItineraryDependencies["optimizeWalkingRoute"]>[0]> = [];
  const spied: GenerateItineraryDependencies = {
    ...deps,
    optimizeWalkingRoute: async (input) => {
      calls.push(input);
      return deps.optimizeWalkingRoute(input);
    },
  };
  const result = await generateItineraryForUser(user.id, NOW, spied);
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].origin, { lat: hotelPlace.latitude, lng: hotelPlace.longitude });
  assert.equal(calls[0].returnToOrigin, true);
  assert.equal(calls[0].stops.length, 2, "only the two eligible places are stops");
  assert.equal(calls[0].stops.some((stop) => stop.lat === hotelPlace.latitude && stop.lng === hotelPlace.longitude), false);
  if (result.ok) assert.equal(result.itinerary.stops.some((stop) => stop.placeId === hotelPlace.id), false);
});

test("a hotel with only facilities (no partners) still gets a plan made only of those facilities", async () => {
  const facilities = [makePlace({ category: "spa" }), makePlace({ category: "restaurant" })];
  const { deps, user } = buildDeps({ eligiblePlaces: facilities, preferences: { categories: ["spa", "restaurant"] } });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.itinerary.stops.map((s) => s.placeId).sort(), facilities.map((f) => f.id).sort());
  }
});

test("an active partner is chosen and leads the day; its stop is checked in by QR", async () => {
  const partnerPlace = makePlace({ category: "restaurant", name: "Partner Place" });
  const { deps, user } = buildDeps({
    eligiblePlaces: [partnerPlace],
    partnerRelations: [{ hotelId: "hotel-1", placeId: partnerPlace.id, priority: 1, createdAt: new Date(), place: partnerPlace }],
  });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.itinerary.stops.length, 1);
    assert.equal(result.itinerary.stops[0].isHotelStop, false);
    assert.equal(result.itinerary.stops[0].placeId, partnerPlace.id);
    assert.equal(result.itinerary.stops[0].checkInMethod, "qr");
  }
});

test("landmark/historical categories get qr check-in, everything else gets gps", async () => {
  const landmark = makePlace({ category: "landmark" });
  const restaurant = makePlace({ category: "restaurant" });
  const { deps, user } = buildDeps({
    eligiblePlaces: [landmark, restaurant],
    preferences: { categories: ["landmark", "restaurant"] },
  });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    const byId = new Map(result.itinerary.stops.map((s) => [s.placeId, s]));
    assert.equal(byId.get(landmark.id)?.checkInMethod, "qr");
    assert.equal(byId.get(restaurant.id)?.checkInMethod, "gps");
  }
});

test("fewer candidates than the target stop count yields fewer unique stops, never repeats or substitutes", async () => {
  const partnerPlace = makePlace({ category: "restaurant" });
  const regularPlace = makePlace({ category: "restaurant" });
  const { deps, user } = buildDeps({
    eligiblePlaces: [partnerPlace, regularPlace],
    preferences: { categories: ["restaurant"] },
    partnerRelations: [{ hotelId: "hotel-1", placeId: partnerPlace.id, priority: null, createdAt: new Date(), place: partnerPlace }],
  });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    // No previous day -> target is MIN_STOPS (4), but only 2 unique eligible places exist in total.
    assert.equal(result.itinerary.stops.length, 2);
    assert.equal(result.itinerary.stops.some((s) => s.isHotelStop), false);
    const placeIds = result.itinerary.stops.map((s) => s.placeId);
    assert.equal(new Set(placeIds).size, placeIds.length);
  }
});

test("routing failure fails the whole generation instead of persisting a fake route", async () => {
  const { deps, user, store } = buildDeps({
    eligiblePlaces: [makePlace({ category: "restaurant" })],
    preferences: { categories: ["restaurant"] },
    route: { ok: false, reason: "no_route", message: "no route" },
  });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "routing_failed");
  assert.equal(await store.findItineraryDay(user.id, "hotel-1", 1), null);
});

test("a malformed route order (length mismatch) fails instead of persisting undefined stops", async () => {
  // Two eligible stops, but the route mock only returns a single-entry order.
  const { deps, user } = buildDeps({
    eligiblePlaces: [makePlace({ category: "restaurant" }), makePlace({ category: "restaurant" })],
    preferences: { categories: ["restaurant"] },
    route: routeWithOrder([0]),
  });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "routing_failed");
});

test("the optimizer's stop order is kept exactly as returned (the hotel is only the origin/return point)", async () => {
  const { deps, user } = buildDeps({
    eligiblePlaces: [makePlace({ category: "restaurant" }), makePlace({ category: "restaurant" })],
    preferences: { categories: ["restaurant"] },
    route: routeWithOrder([1, 0]),
  });
  const sent: Array<{ lat: number; lng: number }> = [];
  const spied: GenerateItineraryDependencies = {
    ...deps,
    optimizeWalkingRoute: async (input) => {
      sent.push(...input.stops);
      return deps.optimizeWalkingRoute(input);
    },
  };
  const result = await generateItineraryForUser(user.id, NOW, spied);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.itinerary.stops.length, 2);
    // The saved order is exactly the optimizer's permutation [1, 0] of what was sent — independent of ranking.
    assert.deepEqual(
      result.itinerary.stops.map((s) => ({ lat: s.latitude, lng: s.longitude })),
      [sent[1], sent[0]]
    );
    assert.equal(result.itinerary.stops.some((s) => s.isHotelStop), false);
  }
});

test("difficulty ratchet: no previous day defaults to MIN_STOPS (4)", async () => {
  const nearby = Array.from({ length: 6 }, () => makePlace({ category: "restaurant" }));
  const { deps, user } = buildDeps({ eligiblePlaces: nearby, preferences: { categories: ["restaurant"] } });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.itinerary.stops.length, 4);
});

test("difficulty ratchet: a fully-visited, easily-completed previous day raises the target by 1", async () => {
  const store = createFakeItineraryStore();
  // Previous day (dayNumber 1): 4 stops, estimated 7200s, actually finished in
  // 1800s (< 7200*0.5 = 3600 threshold) and fully visited -> "easy" -> +1 next time.
  store.seedDay(
    {
      id: "day-prev",
      userId: "user-1",
      principalId: null,
      hotelId: "hotel-1",
      hotelStayId: "stay-1",
      dayNumber: 1,
      stopCount: 4,
      routeGeoJson: null,
      totalDurationSeconds: 7200,
      originalDurationSeconds: 7200,
      availableMinutes: null,
      generatedAt: new Date("2026-03-10T08:00:00Z"),
      completedAt: new Date("2026-03-10T08:30:00Z"),
    },
    [
      {
        id: "stop-prev-1",
        dayId: "day-prev",
        placeId: "place-prev",
        isHotelStop: false,
        checkInMethod: "gps",
        name: "Prev",
        category: "restaurant",
        latitude: 41.7,
        longitude: 44.8,
        imageUrl: null,
        visitDurationMinutes: null,
        position: 0,
        visitedAt: new Date("2026-03-10T08:15:00Z"),
        supersededAt: null,
        supersededReason: null,
      },
    ]
  );
  const nearby = Array.from({ length: 6 }, () => makePlace({ category: "restaurant" }));
  const { deps, user } = buildDeps({
    eligiblePlaces: nearby,
    preferences: { categories: ["restaurant"] },
    store,
    checkIn: new Date("2026-03-10T08:00:00Z"),
  });
  // dayNumber for 2026-03-11 relative to a 2026-03-10 check-in is 2 -> "previous day" (dayNumber < 2) finds day-prev.
  const result = await generateItineraryForUser(user.id, new Date("2026-03-11T08:00:00Z"), deps);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.itinerary.stops.length, 5);
});

test("an existing itinerary within cooldown is returned as-is, without calling routing again", async () => {
  const nearby = [makePlace({ category: "restaurant" })];
  const { deps, user, getRouteCallCount } = buildDeps({ eligiblePlaces: nearby, preferences: { categories: ["restaurant"] } });

  const first = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(first.ok, true);
  assert.equal(getRouteCallCount(), 1);

  const second = await generateItineraryForUser(user.id, new Date(NOW.getTime() + 60 * 60 * 1000), deps);
  assert.equal(second.ok, true);
  if (second.ok && first.ok) {
    assert.equal(second.regenerated, false);
    assert.equal(second.itinerary.day.id, first.itinerary.day.id);
  }
  assert.equal(getRouteCallCount(), 1, "routing must not be called again for a cooldown hit");
});

test("an admin bypasses the cooldown and regenerates today's itinerary in place", async () => {
  const nearby = [makePlace({ category: "restaurant" })];
  const admin = makeUser({ role: "admin" });
  const { deps, getRouteCallCount } = buildDeps({ user: admin, eligiblePlaces: nearby, preferences: { categories: ["restaurant"] } });

  const first = await generateItineraryForUser(admin.id, NOW, deps);
  assert.equal(first.ok, true);

  const second = await generateItineraryForUser(admin.id, new Date(NOW.getTime() + 5 * 60 * 1000), deps);
  assert.equal(second.ok, true);
  if (second.ok && first.ok) {
    assert.equal(second.regenerated, true);
    assert.equal(second.itinerary.day.id, first.itinerary.day.id, "rebuilds the same day row, does not create a second one");
  }
  assert.equal(getRouteCallCount(), 2);
});

test("cooldown expired (existing day generated long ago) rebuilds the same day in place", async () => {
  const store = createFakeItineraryStore();
  store.seedDay(
    {
      id: "day-stale",
      userId: "user-1",
      principalId: null,
      hotelId: "hotel-1",
      dayNumber: 1,
      hotelStayId: "stay-1",
      stopCount: 1,
      routeGeoJson: null,
      totalDurationSeconds: 1800,
      originalDurationSeconds: 1800,
      availableMinutes: null,
      generatedAt: new Date("2026-03-09T00:00:00Z"), // > 24h before NOW
      completedAt: null,
    },
    [
      {
        id: "stop-stale-1",
        dayId: "day-stale",
        placeId: "place-stale",
        isHotelStop: false,
        checkInMethod: "gps",
        name: "Stale",
        category: "restaurant",
        latitude: 41.7,
        longitude: 44.8,
        imageUrl: null,
        visitDurationMinutes: null,
        position: 0,
        visitedAt: null,
        supersededAt: null,
        supersededReason: null,
      },
    ]
  );
  const nearby = [makePlace({ category: "restaurant" })];
  const { deps, user } = buildDeps({ eligiblePlaces: nearby, preferences: { categories: ["restaurant"] }, store });

  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.regenerated, true);
    assert.equal(result.itinerary.day.id, "day-stale");
    // Only the one eligible place becomes a stop; no hotel stop is added.
    assert.equal(result.itinerary.stops.length, 1);
    assert.equal(result.itinerary.stops[0].isHotelStop, false);
    assert.ok(result.itinerary.stops.some((s) => s.placeId === nearby[0].id));
  }
});

test("losing the create race for a brand-new day returns the winner's itinerary instead of erroring", async () => {
  const store = createFakeItineraryStore();
  const nearby = [makePlace({ category: "restaurant" })];
  const { deps, user } = buildDeps({ eligiblePlaces: nearby, preferences: { categories: ["restaurant"] }, store });

  // Simulate a concurrent winner by seeding day 1 directly (bypassing this call's own persistItinerary),
  // AFTER candidate/route resolution would already be in flight in a real race, before this call persists.
  const originalPersist = store.persistItinerary;
  let calls = 0;
  const deps2: GenerateItineraryDependencies = {
    ...deps,
    persistItinerary: async (input) => {
      calls += 1;
      if (calls === 1) {
        store.seedDay({
          id: "day-winner",
          userId: input.userId,
          principalId: null,
          hotelId: input.hotelId,
          hotelStayId: input.hotelStayId,
          dayNumber: input.dayNumber,
          stopCount: 1,
          routeGeoJson: null,
          totalDurationSeconds: 1800,
          originalDurationSeconds: 1800,
          availableMinutes: null,
          generatedAt: NOW,
          completedAt: null,
        });
      }
      return originalPersist(input);
    },
  };

  const result = await generateItineraryForUser(user.id, NOW, deps2);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.regenerated, false);
    assert.equal(result.itinerary.day.id, "day-winner");
  }
});

// ---------------------------------------------------------------------------
// History is preserved: rebuilds never delete or supersede completed stops
// (fixed ids and times; nothing depends on counters or test order)
// ---------------------------------------------------------------------------

const H = {
  day: "00000000-0000-4000-8000-0000000000c1",
  doneStop: "00000000-0000-4000-8000-0000000000e1",
  pendingStop1: "00000000-0000-4000-8000-0000000000e2",
  pendingStop2: "00000000-0000-4000-8000-0000000000e3",
  donePlace: "00000000-0000-4000-8000-0000000000d1",
  pendingPlace1: "00000000-0000-4000-8000-0000000000d2",
  pendingPlace2: "00000000-0000-4000-8000-0000000000d3",
} as const;

const OLD_GENERATION = new Date("2026-03-09T00:00:00Z"); // more than 24h before NOW -> the cooldown has expired
const RECENT_GENERATION = new Date("2026-03-10T08:00:00Z"); // within the cooldown
const COMPLETED_AT = new Date("2026-03-09T01:00:00Z");

function historyDay(generatedAt: Date, overrides: Partial<ItineraryDay> = {}): ItineraryDay {
  return {
    id: H.day,
    userId: "user-1",
    principalId: null,
    hotelId: "hotel-1",
    hotelStayId: "stay-1",
    dayNumber: 1,
    stopCount: 3,
    routeGeoJson: null,
    totalDurationSeconds: 3600,
    originalDurationSeconds: 3600,
    availableMinutes: null,
    generatedAt,
    completedAt: null,
    ...overrides,
  };
}

function historyStop(id: string, placeId: string, position: number, overrides: Partial<ItineraryStop> = {}): ItineraryStop {
  return {
    id,
    dayId: H.day,
    placeId,
    isHotelStop: false,
    checkInMethod: "gps",
    name: `Saved stop ${position + 1}`,
    category: "restaurant",
    latitude: 41.7 + position * 0.001,
    longitude: 44.8,
    imageUrl: null,
    visitDurationMinutes: null,
    position,
    visitedAt: null,
    supersededAt: null,
    supersededReason: null,
    ...overrides,
  };
}

const completedStop = () => historyStop(H.doneStop, H.donePlace, 0, { visitedAt: COMPLETED_AT });
const pendingStops = () => [historyStop(H.pendingStop1, H.pendingPlace1, 1), historyStop(H.pendingStop2, H.pendingPlace2, 2)];

/** Five eligible Places: the three already in the saved plan (so they are still eligible) plus fresh candidates. */
function eligibleForRebuild() {
  const inPlan = [
    makePlace({ id: H.donePlace, category: "restaurant", name: "Completed place" }),
    makePlace({ id: H.pendingPlace1, category: "restaurant", name: "Pending place 1" }),
    makePlace({ id: H.pendingPlace2, category: "restaurant", name: "Pending place 2" }),
  ];
  const fresh = Array.from({ length: 4 }, (_, i) => makePlace({ id: `00000000-0000-4000-8000-0000000000f${i + 1}`, category: "restaurant", name: `Fresh ${i + 1}` }));
  return { inPlan, fresh, all: [...inPlan, ...fresh] };
}

test("a full rebuild NEVER deletes or supersedes a completed stop: its row, position and visit time are untouched", async () => {
  const store = createFakeItineraryStore();
  const done = completedStop();
  store.seedDay(historyDay(OLD_GENERATION), [done, ...pendingStops()]);
  const { all } = eligibleForRebuild();
  const { deps, user } = buildDeps({ eligiblePlaces: all, preferences: { categories: ["restaurant"] }, store });

  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.regenerated, true);

  const rows = store.listAllStops(H.day);
  const doneNow = rows.find((s) => s.id === H.doneStop);
  assert.deepEqual(doneNow, done, "the completed stop row is byte-for-byte unchanged");
  assert.equal(doneNow?.supersededAt, null);

  // It is still in the ACTIVE plan returned to the guest.
  assert.ok(result.itinerary.stops.some((s) => s.id === H.doneStop));
  assert.equal(result.itinerary.stops[0].id, H.doneStop, "completed stop keeps its place at the front");
});

test("a full rebuild SUPERSEDES (never deletes) the old pending stops: their snapshots stay as history", async () => {
  const store = createFakeItineraryStore();
  const before = pendingStops();
  store.seedDay(historyDay(OLD_GENERATION), [completedStop(), ...before]);
  const { all } = eligibleForRebuild();
  const { deps, user } = buildDeps({ eligiblePlaces: all, preferences: { categories: ["restaurant"] }, store });

  await generateItineraryForUser(user.id, NOW, deps);

  const rows = store.listAllStops(H.day);
  for (const old of before) {
    const kept = rows.find((s) => s.id === old.id);
    assert.ok(kept, `${old.id} still exists as history`);
    assert.equal(kept.supersededReason, "plan_regenerated");
    assert.ok(kept.supersededAt);
    assert.equal(kept.name, old.name, "snapshot preserved");
    assert.equal(kept.latitude, old.latitude);
  }
  // None of the superseded rows is in the active plan.
  const active = await store.listItineraryStops(H.day);
  assert.equal(active.some((s) => before.some((b) => b.id === s.id)), false);
});

test("a full rebuild adds only the NEW pending stops the target still needs, after the highest existing position, never re-picking a completed place", async () => {
  const store = createFakeItineraryStore();
  store.seedDay(historyDay(OLD_GENERATION), [completedStop(), ...pendingStops()]);
  const { all } = eligibleForRebuild();
  const { deps, user } = buildDeps({ eligiblePlaces: all, preferences: { categories: ["restaurant"] }, store });

  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (!result.ok) return;

  // Target is 4 stops in total; 1 is completed, so 3 new pending stops are added.
  assert.equal(result.itinerary.stops.length, 4);
  const fresh = result.itinerary.stops.filter((s) => s.id !== H.doneStop);
  assert.equal(fresh.length, 3);
  assert.ok(fresh.every((s) => s.position > 2), "new stops are appended after every existing row (history rows included)");
  assert.equal(fresh.some((s) => s.placeId === H.donePlace), false, "the completed place is not picked again");
  assert.equal(result.itinerary.day.stopCount, 4);
  assert.equal(result.itinerary.day.completedAt, null, "pending stops were added, so the day is not complete");
});

test("completed visits stay counted in scoring history after a rebuild; superseded unvisited stops do not", async () => {
  const store = createFakeItineraryStore();
  store.seedDay(historyDay(OLD_GENERATION), [completedStop(), ...pendingStops()]);
  const { all } = eligibleForRebuild();
  const { deps, user } = buildDeps({ eligiblePlaces: all, preferences: { categories: ["restaurant"] }, store });

  await generateItineraryForUser(user.id, NOW, deps);

  const history = await store.getStopUsageHistory(user.id, "hotel-1");
  assert.equal(history.get(H.donePlace), 1, "the completed visit still counts");
  assert.equal(history.has(H.pendingPlace1), false, "a superseded, never-visited stop does not count as visited");
  assert.equal(history.has(H.pendingPlace2), false);
});

test("the admin bypass rebuild preserves completed stops too (same path)", async () => {
  const store = createFakeItineraryStore();
  const done = completedStop();
  store.seedDay(historyDay(RECENT_GENERATION), [done, ...pendingStops()]); // inside the cooldown: only the admin bypass can rebuild
  const { all } = eligibleForRebuild();
  const { deps, user } = buildDeps({ user: makeUser({ role: "admin" }), eligiblePlaces: all, preferences: { categories: ["restaurant"] }, store });

  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.regenerated, true);
  assert.deepEqual(store.listAllStops(H.day).find((s) => s.id === H.doneStop), done);
});

test("when completed stops already meet the target there is nothing to add: the day is returned unchanged and no routing call is made", async () => {
  const store = createFakeItineraryStore();
  const completed = ["1", "2", "3", "4"].map((n, i) =>
    historyStop(`00000000-0000-4000-8000-0000000000a${n}`, `00000000-0000-4000-8000-0000000000b${n}`, i, { visitedAt: COMPLETED_AT })
  );
  store.seedDay(historyDay(OLD_GENERATION, { stopCount: 4, completedAt: COMPLETED_AT }), completed);
  const { all } = eligibleForRebuild();
  const { deps, user, getRouteCallCount } = buildDeps({ eligiblePlaces: all, preferences: { categories: ["restaurant"] }, store });

  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.regenerated, false);
  assert.equal(getRouteCallCount(), 0);
  assert.deepEqual(store.listAllStops(H.day), completed);
});

test("a rebuild with no eligible experiences changes NOTHING: history and completed stops stay exactly as saved", async () => {
  const store = createFakeItineraryStore();
  const rowsBefore = [completedStop(), ...pendingStops()];
  store.seedDay(historyDay(OLD_GENERATION), rowsBefore);
  const { deps, user } = buildDeps({ eligiblePlaces: [], preferences: { categories: ["restaurant"] }, store });

  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "no_eligible_experiences");
  assert.deepEqual(store.listAllStops(H.day), rowsBefore);
});

test("ordinary Generate NEVER changes an existing day, even when a pending stop has become unavailable (only the explicit plan-repair action may)", async () => {
  const store = createFakeItineraryStore();
  const rowsBefore = [completedStop(), ...pendingStops()];
  store.seedDay(historyDay(RECENT_GENERATION), rowsBefore); // within the cooldown
  // None of the saved stops' Places is eligible any more.
  const { deps, user, getRouteCallCount } = buildDeps({
    eligiblePlaces: [makePlace({ id: "00000000-0000-4000-8000-0000000000f9", category: "restaurant" })],
    preferences: { categories: ["restaurant"] },
    store,
  });

  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.regenerated, false, "the existing day is returned as it was");
    assert.deepEqual(result.itinerary.stops.map((s) => s.id), rowsBefore.map((s) => s.id));
  }
  assert.equal(getRouteCallCount(), 0, "no routing, no persistence: the route cannot change silently");
  assert.deepEqual(store.listAllStops(H.day), rowsBefore);
});

// ---------------------------------------------------------------------------
// The difficulty ratchet judges the guest against the ORIGINAL estimate, even after a repair
// has updated the displayed (active-route) duration.
// ---------------------------------------------------------------------------

function previousDayWithDurations(totalDurationSeconds: number | null, originalDurationSeconds: number | null) {
  const store = createFakeItineraryStore();
  store.seedDay(
    {
      id: "00000000-0000-4000-8000-0000000000c9",
      userId: "user-1",
      principalId: null,
      hotelId: "hotel-1",
      hotelStayId: "stay-1",
      dayNumber: 1,
      stopCount: 4,
      routeGeoJson: null,
      totalDurationSeconds,
      originalDurationSeconds,
      availableMinutes: null,
      generatedAt: new Date("2026-03-10T08:00:00Z"),
      // Finished in 1800s, every stop visited.
      completedAt: new Date("2026-03-10T08:30:00Z"),
    },
    [
      {
        id: "00000000-0000-4000-8000-0000000000e9",
        dayId: "00000000-0000-4000-8000-0000000000c9",
        placeId: "00000000-0000-4000-8000-0000000000d9",
        isHotelStop: false,
        checkInMethod: "gps",
        name: "Prev",
        category: "restaurant",
        latitude: 41.7,
        longitude: 44.8,
        imageUrl: null,
        visitDurationMinutes: null,
        position: 0,
        visitedAt: new Date("2026-03-10T08:15:00Z"),
        supersededAt: null,
        supersededReason: null,
      },
    ]
  );
  return store;
}

async function nextDayStopCount(store: ReturnType<typeof createFakeItineraryStore>): Promise<number> {
  const nearby = Array.from({ length: 6 }, () => makePlace({ category: "restaurant" }));
  const { deps, user } = buildDeps({
    eligiblePlaces: nearby,
    preferences: { categories: ["restaurant"] },
    store,
    checkIn: new Date("2026-03-10T08:00:00Z"),
  });
  const result = await generateItineraryForUser(user.id, new Date("2026-03-11T08:00:00Z"), deps);
  assert.equal(result.ok, true);
  return result.ok ? result.itinerary.stops.length : -1;
}

test("difficulty uses the ORIGINAL estimate: a repaired day (shorter active duration) is still judged against what was planned", async () => {
  // Active route duration was shortened to 1200s by a repair; the original estimate was 7200s.
  // Finished in 1800s: against the original (7200 * 0.5 = 3600) it IS easy -> +1 stop.
  // (Judged against the repaired 1200s it would NOT be easy and the count would stay 4.)
  assert.equal(await nextDayStopCount(previousDayWithDurations(1200, 7200)), 5);
});

test("an older day without an original estimate falls back to its total duration (behaviour unchanged for existing data)", async () => {
  // Legacy row: original is null, total is 1200 -> threshold 600s; 1800s is not easy -> stays 4.
  assert.equal(await nextDayStopCount(previousDayWithDurations(1200, null)), 4);
  // Legacy row with a long total behaves exactly as before: 7200 -> easy -> 5.
  assert.equal(await nextDayStopCount(previousDayWithDurations(7200, null)), 5);
});

test("a brand-new generated day stores its estimate as BOTH the active and the original duration", async () => {
  const nearby = [makePlace({ category: "restaurant" }), makePlace({ category: "restaurant" })];
  const { deps, user } = buildDeps({ eligiblePlaces: nearby, preferences: { categories: ["restaurant"] } });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.itinerary.day.totalDurationSeconds, 3600);
    assert.equal(result.itinerary.day.originalDurationSeconds, 3600);
  }
});

test("a full rebuild is a NEW plan: both the active and the original estimate become the rebuilt plan's estimate", async () => {
  const store = createFakeItineraryStore();
  store.seedDay(historyDay(OLD_GENERATION, { totalDurationSeconds: 1200, originalDurationSeconds: 7200 }), [completedStop(), ...pendingStops()]);
  const { all } = eligibleForRebuild();
  const { deps, user } = buildDeps({ eligiblePlaces: all, preferences: { categories: ["restaurant"] }, store });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.itinerary.day.totalDurationSeconds, 3600);
    assert.equal(result.itinerary.day.originalDurationSeconds, 3600);
  }
});
