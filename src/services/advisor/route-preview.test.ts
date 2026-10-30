import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Hotel, ItineraryDay, ItineraryStop, Place } from "@/db/schema";
import { getCurrentItineraryForUser, type CurrentItineraryDependencies } from "./current-itinerary";
import { MAX_STOPS } from "./difficulty";
import { contextFromEligible, type AvailabilityContext } from "./stop-availability";
import { makeTestPlace } from "./test-utils";

/**
 * Route preview: once a guest has explicitly generated a plan, the read model carries the WHOLE plan — every stop,
 * the saved route line and the hotel it starts and ends at — so the map can draw it. This replaces the earlier
 * progressive reveal on purpose (product decision: the full route is shown after an explicit generate).
 *
 * What does NOT change is authority: only the server's first pending stop is "current", so a later stop is
 * visible but can never be checked in early, and the camera flag is still asked about the current stop only.
 */

const NOW = new Date("2026-03-10T12:00:00Z");
const USER = "user-1";
const HOTEL = "hotel-1";
const STAY = "stay-1";
const DAY = "day-1";

const hotelPlace = makeTestPlace({ id: "hotel-place", category: "hotel", name: "Test Hotel", latitude: 41.7, longitude: 44.8 });
const hotel: Hotel = { id: HOTEL, placeId: hotelPlace.id, qrToken: null, createdAt: NOW, updatedAt: NOW };

const PLACES = {
  first: "place-first",
  second: "place-second",
  third: "place-third",
} as const;

const LATER_NAMES = {
  second: "Jazz Cellar",
  third: "Rooftop Garden",
} as const;

const SAVED_LINE = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "LineString",
    coordinates: [
      [44.8, 41.7],
      [44.81, 41.71],
      [44.82, 41.72],
      [44.8, 41.7],
    ],
  },
};

function makeDay(overrides: Partial<ItineraryDay> = {}): ItineraryDay {
  return {
    id: DAY,
    userId: USER,
    principalId: null,
    hotelId: HOTEL,
    hotelStayId: STAY,
    dayNumber: 1,
    stopCount: 3,
    routeGeoJson: SAVED_LINE,
    totalDurationSeconds: 3600,
    originalDurationSeconds: 3600,
    availableMinutes: 240,
    generatedAt: NOW,
    completedAt: null,
    ...overrides,
  };
}

function makeStop(id: string, placeId: string, position: number, overrides: Partial<ItineraryStop> = {}): ItineraryStop {
  return {
    id,
    dayId: DAY,
    placeId,
    isHotelStop: false,
    checkInMethod: "gps",
    name: `Stop ${position + 1}`,
    category: "restaurant",
    latitude: 41.7 + position * 0.01,
    longitude: 44.8 + position * 0.01,
    imageUrl: null,
    visitDurationMinutes: 20,
    position,
    visitedAt: null,
    supersededAt: null,
    supersededReason: null,
    ...overrides,
  };
}

/** Availability built the same way production does: from the hotel's eligible Place ids. */
function context(eligiblePlaceIds: string[]): AvailabilityContext {
  return contextFromEligible(
    { id: STAY, hotel: { id: HOTEL }, checkIn: new Date("2026-03-10T08:00:00Z"), checkOut: null },
    eligiblePlaceIds.map((id) => ({ place: { id } as Place })),
    NOW
  );
}

function buildDeps(
  stops: ItineraryStop[],
  eligiblePlaceIds: string[],
  day = makeDay(),
  /** Records which Place ids the view model asked about AR targets for. */
  arTargetQuestions?: string[][]
): CurrentItineraryDependencies {
  return {
    findActiveStayForUser: async () => ({
      id: STAY,
      checkIn: new Date("2026-03-10T08:00:00Z"),
      checkOut: null,
      hotel,
      place: hotelPlace,
    }),
    findItineraryDay: async () => day,
    listItineraryStops: async () => stops,
    findPlaceIdsWithArTargets: async (placeIds) => {
      arTargetQuestions?.push([...placeIds]);
      return new Set<string>(placeIds);
    },
    loadAvailabilityContext: async () => context(eligiblePlaceIds),
  };
}

const threeStopDay = () => [
  makeStop("s1", PLACES.first, 0),
  makeStop("s2", PLACES.second, 1, { name: LATER_NAMES.second, latitude: 41.95, longitude: 44.95 }),
  makeStop("s3", PLACES.third, 2, { name: LATER_NAMES.third, latitude: 41.96, longitude: 44.96 }),
];
const ALL = [PLACES.first, PLACES.second, PLACES.third];

describe("what the guest's payload contains after a plan is generated", () => {
  it("shows every stop, numbered, with only the first pending one as current", async () => {
    const result = await getCurrentItineraryForUser(USER, NOW, buildDeps(threeStopDay(), ALL));
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;

    assert.deepEqual(result.stops.map((s) => s.id), ["s1", "s2", "s3"]);
    assert.deepEqual(result.stops.map((s) => s.position), [0, 1, 2]);
    assert.deepEqual(result.stops.map((s) => s.status), ["current", "upcoming", "upcoming"]);
    assert.equal(result.currentStop?.id, "s1", "check-in progression stays server-controlled");
    assert.equal(result.stopCount, 3);
  });

  it("sends the saved route line, and the hotel as origin and return", async () => {
    const result = await getCurrentItineraryForUser(USER, NOW, buildDeps(threeStopDay(), ALL));
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;

    assert.equal(result.routeStatus, "available");
    assert.equal(result.routeGeometry?.geometry.coordinates.length, 4, "the full round trip, exactly as saved");
    assert.deepEqual(result.hotel, { name: "Test Hotel", latitude: 41.7, longitude: 44.8 });
  });

  it("gives whole-minute walking estimates per stop and for the return", async () => {
    const result = await getCurrentItineraryForUser(USER, NOW, buildDeps(threeStopDay(), ALL));
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;

    for (const stop of result.stops) {
      assert.ok(Number.isInteger(stop.walkMinutesFromPrevious) && stop.walkMinutesFromPrevious >= 0);
    }
    assert.ok(Number.isInteger(result.returnWalkMinutes) && result.returnWalkMinutes > 0);
  });

  it("reports an unavailable route line honestly when the saved geometry is missing or malformed", async () => {
    const malformed: unknown[] = [
      null,
      {},
      { type: "Feature", geometry: { type: "Point", coordinates: [1, 2] } },
      { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } },
      { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [[44.8, 41.7]] } },
    ];
    for (const bad of malformed) {
      const result = await getCurrentItineraryForUser(USER, NOW, buildDeps(threeStopDay(), ALL, makeDay({ routeGeoJson: bad })));
      assert.equal(result.status, "ready");
      if (result.status !== "ready") return;
      assert.equal(result.routeStatus, "unavailable");
      assert.equal(result.routeGeometry, null, "never a fabricated or straight-line fallback");
      assert.equal(result.stops.length, 3, "ordered stops and timings are still shown");
    }
  });

  it("keeps the guest's own completed stops and advances current as they finish", async () => {
    const stops = threeStopDay();
    stops[0] = { ...stops[0], visitedAt: new Date("2026-03-10T11:00:00Z") };
    const result = await getCurrentItineraryForUser(USER, NOW, buildDeps(stops, ALL));
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;

    assert.deepEqual(result.stops.map((s) => s.status), ["completed", "current", "upcoming"]);
    assert.equal(result.currentStop?.name, LATER_NAMES.second);
  });

  it("has no current stop on a finished day", async () => {
    const stops = threeStopDay().map((stop) => ({ ...stop, visitedAt: new Date("2026-03-10T11:00:00Z") }));
    const result = await getCurrentItineraryForUser(USER, NOW, buildDeps(stops, ALL, makeDay({ completedAt: NOW })));
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    assert.equal(result.currentStop, null);
    assert.equal(result.stops.length, 3);
  });
});

describe("nothing is previewed before generation or without the guest's own stay", () => {
  it("returns no route and no stops when no plan was generated", async () => {
    const deps = { ...buildDeps(threeStopDay(), ALL), findItineraryDay: async () => null };
    const result = await getCurrentItineraryForUser(USER, NOW, deps);
    assert.equal(result.status, "no_itinerary_yet");
    const serialised = JSON.stringify(result);
    assert.equal(serialised.includes("LineString"), false);
    assert.equal(serialised.includes(LATER_NAMES.second), false);
  });

  it("returns nothing without an active stay", async () => {
    const deps = { ...buildDeps(threeStopDay(), ALL), findActiveStayForUser: async () => null };
    assert.deepEqual(await getCurrentItineraryForUser(USER, NOW, deps), { status: "no_active_stay" });
  });
});

describe("unavailable stops stay visible and keep Repair reachable", () => {
  it("shows a later unavailable stop as unavailable while the earlier stop stays current", async () => {
    const result = await getCurrentItineraryForUser(USER, NOW, buildDeps(threeStopDay(), [PLACES.first, PLACES.third]));
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    assert.equal(result.hasUnavailableStops, true);
    assert.equal(result.stops.find((s) => s.id === "s2")?.status, "unavailable");
    assert.equal(result.currentStop?.id, "s1");
    assert.equal(result.blockedByUnavailableStop, null);
  });

  it("an unavailable first pending stop blocks itself and is never offered as current", async () => {
    const result = await getCurrentItineraryForUser(USER, NOW, buildDeps(threeStopDay(), [PLACES.second, PLACES.third]));
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    assert.equal(result.currentStop, null);
    assert.deepEqual(result.blockedByUnavailableStop, { id: "s1", name: "Stop 1" });
    assert.ok(result.stops.find((s) => s.id === "s1")?.unavailableMessage);
  });

  it("says nothing is wrong when nothing is", async () => {
    const result = await getCurrentItineraryForUser(USER, NOW, buildDeps(threeStopDay(), ALL));
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    assert.equal(result.hasUnavailableStops, false);
  });
});

describe("the guest surfaces draw the saved plan, not a second Mapbox request", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("passes the saved geometry to the shared map and keeps the directions leg separate", () => {
    const section = stripComments(read("src/app/(app)/advisor-map-section.tsx"));
    assert.match(section, /route=\{ready\?\.routeGeometry \?\? null\}/);
    assert.match(section, /directionsLeg=\{directionsLeg\}/);
    assert.doesNotMatch(section, /getWalkingRoute|optimizeWalkingRoute|fetch\(/, "no Mapbox request just to draw the same line");
  });

  it("offers a retry that takes no arguments when the line could not be drawn", () => {
    const sheet = stripComments(read("src/app/(app)/advisor-sheet.tsx"));
    assert.match(sheet, /state\.routeStatus === "unavailable"/);
    assert.match(sheet, /retryRouteGeometryAction\(\)/);
  });

  it("generation can never exceed the Directions waypoint limit", () => {
    // hotel + stops + hotel must stay within Mapbox's 25-waypoint cap (services/routing enforces it too).
    assert.ok(MAX_STOPS + 2 <= 25);
  });
});

describe("the camera flag respects server-controlled progression", () => {
  it("asks about the CURRENT stop's Place only", async () => {
    const questions: string[][] = [];
    await getCurrentItineraryForUser(USER, NOW, buildDeps(threeStopDay(), ALL, makeDay(), questions));
    assert.deepEqual(questions, [[PLACES.first]]);
  });

  it("never sets the flag on a stop that is not the current one", async () => {
    const result = await getCurrentItineraryForUser(USER, NOW, buildDeps(threeStopDay(), ALL, makeDay(), []));
    assert.equal(result.status, "ready");
    if (result.status !== "ready") return;
    for (const stop of result.stops) {
      if (stop.id === result.currentStop?.id) continue;
      assert.equal(stop.canCheckInWithCamera, false);
    }
  });
});
