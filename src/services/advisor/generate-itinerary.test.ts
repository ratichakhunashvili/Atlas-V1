import { test } from "node:test";
import assert from "node:assert/strict";
import type { Hotel, ItineraryDay, ItineraryStop, Place, User } from "@/db/schema";
import type { OptimizedRoute, RoutingResult } from "@/services/routing";
import { generateItineraryForUser, type GenerateItineraryDependencies } from "./generate-itinerary";

let placeCounter = 0;
function makePlace(overrides: Partial<Place> = {}): Place {
  placeCounter += 1;
  return {
    id: `place-${placeCounter}`,
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

  const listItineraryStops: GenerateItineraryDependencies["listItineraryStops"] = async (dayId) =>
    stops.filter((s) => s.dayId === dayId).sort((a, b) => a.position - b.position);

  const getStopUsageHistory: GenerateItineraryDependencies["getStopUsageHistory"] = async (userId, hotelId) => {
    const history = new Map<string, number>();
    for (const day of days.filter((d) => d.userId === userId && d.hotelId === hotelId)) {
      for (const stop of stops.filter((s) => s.dayId === day.id)) {
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
      stops = stops.filter((s) => s.dayId !== input.existingDayId);
      const index = days.findIndex((d) => d.id === input.existingDayId);
      day = {
        ...days[index],
        stopCount: input.stops.length,
        routeGeoJson: input.routeGeoJson as ItineraryDay["routeGeoJson"],
        totalDurationSeconds: input.totalDurationSeconds,
        generatedAt: input.generatedAt,
        completedAt: input.completedAt,
      };
      days[index] = day;
    } else {
      dayIdCounter += 1;
      day = {
        id: `day-${dayIdCounter}`,
        userId: input.userId,
        hotelId: input.hotelId,
        hotelStayId: input.hotelStayId,
        dayNumber: input.dayNumber,
        stopCount: input.stops.length,
        routeGeoJson: input.routeGeoJson as ItineraryDay["routeGeoJson"],
        totalDurationSeconds: input.totalDurationSeconds,
        generatedAt: input.generatedAt,
        completedAt: input.completedAt,
      };
      days.push(day);
    }

    const newStops: ItineraryStop[] = input.stops.map((stop, i) => {
      stopIdCounter += 1;
      return { id: `stop-${stopIdCounter}`, dayId: day.id, position: i, ...stop };
    });
    stops.push(...newStops);

    return { status: input.existingDayId ? "updated" : "created", day, stops: newStops };
  };

  /** Test setup only — seeds a day directly so a "cooldown expired" scenario can be constructed without two real-time-spaced calls (impossible under calendar-accurate dayNumbers; see stay-day.test.ts). */
  function seedDay(day: ItineraryDay, dayStops: ItineraryStop[] = []) {
    days.push(day);
    stops.push(...dayStops);
  }

  return {
    findItineraryDay,
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
  nearbyPlaces?: Place[];
  hotelPlaceRelations?: Array<{ hotelId: string; placeId: string; priority: number | null; createdAt: Date; place: Place }>;
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
        ? { userId: user.id, categories: ["restaurant", "landmark"], budget: null, activityLevel: null, updatedAt: new Date() }
        : options.preferences === null
          ? null
          : { userId: user.id, categories: options.preferences.categories, budget: null, activityLevel: null, updatedAt: new Date() },
    listFullPlacesNear: async () => options.nearbyPlaces ?? [],
    listPlacesForHotel: async () => options.hotelPlaceRelations ?? [],
    findItineraryDay: store.findItineraryDay,
    findLatestItineraryDayBefore: store.findLatestItineraryDayBefore,
    listItineraryStops: store.listItineraryStops,
    getStopUsageHistory: store.getStopUsageHistory,
    persistItinerary: store.persistItinerary,
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
    nearbyPlaces: nearby,
  });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    // Zero partners -> the hotel filler also fills the guaranteed slot, in
    // addition to the one museum candidate the unfiltered pool found.
    assert.equal(result.itinerary.stops.length, 2);
    assert.equal(result.itinerary.stops[0].isHotelStop, true, "filler is reordered to the front");
    assert.ok(result.itinerary.stops.some((s) => s.placeId === nearby[0].id));
  }
});

test("zero partners and zero candidates uses the hotel as a filler stop, auto-visited immediately", async () => {
  const { deps, user, hotelPlace } = buildDeps({ nearbyPlaces: [] });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.itinerary.stops.length, 1);
    assert.equal(result.itinerary.stops[0].isHotelStop, true);
    assert.equal(result.itinerary.stops[0].placeId, hotelPlace.id);
    assert.equal(result.itinerary.stops[0].checkInMethod, "auto");
    assert.notEqual(result.itinerary.stops[0].visitedAt, null);
  }
});

test("when the hotel filler is the only stop, the day is marked completed at generation time", async () => {
  const { deps, user } = buildDeps({ nearbyPlaces: [] });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.notEqual(result.itinerary.day.completedAt, null);
  }
});

test("a filler plus a normal unvisited stop does NOT complete the day at generation time", async () => {
  const nearby = [makePlace({ category: "restaurant" })];
  const { deps, user } = buildDeps({ nearbyPlaces: nearby, preferences: { categories: ["restaurant"] } });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.itinerary.stops.length, 2);
    assert.equal(result.itinerary.day.completedAt, null);
  }
});

test("a partner candidate fills the guaranteed slot instead of the hotel filler", async () => {
  const partnerPlace = makePlace({ category: "restaurant", name: "Partner Place" });
  const { deps, user } = buildDeps({
    nearbyPlaces: [partnerPlace],
    hotelPlaceRelations: [{ hotelId: "hotel-1", placeId: partnerPlace.id, priority: 1, createdAt: new Date(), place: partnerPlace }],
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
    nearbyPlaces: [landmark, restaurant],
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

test("fewer candidates than the target stop count yields fewer unique stops, never repeats", async () => {
  // A partner fills the guaranteed slot so the hotel filler never enters the
  // picture here — isolates "pool smaller than target" from the separate
  // zero-partner filler rule.
  const partnerPlace = makePlace({ category: "restaurant" });
  const regularPlace = makePlace({ category: "restaurant" });
  const { deps, user } = buildDeps({
    nearbyPlaces: [partnerPlace, regularPlace],
    preferences: { categories: ["restaurant"] },
    hotelPlaceRelations: [{ hotelId: "hotel-1", placeId: partnerPlace.id, priority: null, createdAt: new Date(), place: partnerPlace }],
  });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    // No previous day -> target is MIN_STOPS (4), but only 2 unique candidates exist in total.
    assert.equal(result.itinerary.stops.length, 2);
    assert.equal(result.itinerary.stops.some((s) => s.isHotelStop), false);
    const placeIds = result.itinerary.stops.map((s) => s.placeId);
    assert.equal(new Set(placeIds).size, placeIds.length);
  }
});

test("routing failure fails the whole generation instead of persisting a fake route", async () => {
  const { deps, user, store } = buildDeps({
    nearbyPlaces: [makePlace({ category: "restaurant" })],
    preferences: { categories: ["restaurant"] },
    route: { ok: false, reason: "no_route", message: "no route" },
  });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "routing_failed");
  assert.equal(await store.findItineraryDay(user.id, "hotel-1", 1), null);
});

test("a malformed route order (length mismatch) fails instead of persisting undefined stops", async () => {
  // Zero partners -> 1 candidate + 1 hotel filler = 2 selected stops, but the
  // route mock only returns a single-entry order.
  const { deps, user } = buildDeps({
    nearbyPlaces: [makePlace({ category: "restaurant" })],
    preferences: { categories: ["restaurant"] },
    route: routeWithOrder([0]),
  });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "routing_failed");
});

test("the hotel filler is always reordered to the front regardless of what Mapbox returned", async () => {
  const partnerPlace = makePlace({ category: "restaurant" });
  // Two candidates + zero partners -> filler is appended last (index 2) before routing.
  // Force Mapbox's optimized order to put the filler (index 2) in the middle.
  const { deps, user } = buildDeps({
    nearbyPlaces: [partnerPlace, makePlace({ category: "restaurant" })],
    preferences: { categories: ["restaurant"] },
    route: (stopCount) => routeWithOrder(stopCount === 3 ? [1, 2, 0] : Array.from({ length: stopCount }, (_, i) => i)),
  });
  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.itinerary.stops.length, 3);
    assert.equal(result.itinerary.stops[0].isHotelStop, true);
  }
});

test("difficulty ratchet: no previous day defaults to MIN_STOPS (4)", async () => {
  const nearby = Array.from({ length: 6 }, () => makePlace({ category: "restaurant" }));
  const { deps, user } = buildDeps({ nearbyPlaces: nearby, preferences: { categories: ["restaurant"] } });
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
      hotelId: "hotel-1",
      hotelStayId: "stay-1",
      dayNumber: 1,
      stopCount: 4,
      routeGeoJson: null,
      totalDurationSeconds: 7200,
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
        position: 0,
        visitedAt: new Date("2026-03-10T08:15:00Z"),
      },
    ]
  );
  const nearby = Array.from({ length: 6 }, () => makePlace({ category: "restaurant" }));
  const { deps, user } = buildDeps({
    nearbyPlaces: nearby,
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
  const { deps, user, getRouteCallCount } = buildDeps({ nearbyPlaces: nearby, preferences: { categories: ["restaurant"] } });

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
  const { deps, getRouteCallCount } = buildDeps({ user: admin, nearbyPlaces: nearby, preferences: { categories: ["restaurant"] } });

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
      hotelId: "hotel-1",
      dayNumber: 1,
      hotelStayId: "stay-1",
      stopCount: 1,
      routeGeoJson: null,
      totalDurationSeconds: 1800,
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
        position: 0,
        visitedAt: null,
      },
    ]
  );
  const nearby = [makePlace({ category: "restaurant" })];
  const { deps, user } = buildDeps({ nearbyPlaces: nearby, preferences: { categories: ["restaurant"] }, store });

  const result = await generateItineraryForUser(user.id, NOW, deps);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.regenerated, true);
    assert.equal(result.itinerary.day.id, "day-stale");
    // Zero partners -> the hotel filler is also selected and reordered to the front.
    assert.equal(result.itinerary.stops.length, 2);
    assert.equal(result.itinerary.stops[0].isHotelStop, true);
    assert.ok(result.itinerary.stops.some((s) => s.placeId === nearby[0].id));
  }
});

test("losing the create race for a brand-new day returns the winner's itinerary instead of erroring", async () => {
  const store = createFakeItineraryStore();
  const nearby = [makePlace({ category: "restaurant" })];
  const { deps, user } = buildDeps({ nearbyPlaces: nearby, preferences: { categories: ["restaurant"] }, store });

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
          hotelId: input.hotelId,
          hotelStayId: input.hotelStayId,
          dayNumber: input.dayNumber,
          stopCount: 1,
          routeGeoJson: null,
          totalDurationSeconds: 1800,
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
