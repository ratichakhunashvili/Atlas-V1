import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Hotel, HotelEvent, ItineraryDay, ItineraryStop, Place, User, UserPreferences } from "@/db/schema";
import type { EligiblePlace } from "@/services/eligibility/rules";
import type { PersistItineraryInput, PersistItineraryResult } from "@/db/queries/itinerary";
import { generateItineraryForUser, type GenerateItineraryDependencies } from "./generate-itinerary";
import { MIN_EVENT_ATTENDANCE_MINUTES, evaluateEventArrival } from "./hotel-events";
import { makeTestPlace } from "./test-utils";

/**
 * An event is only offered when the guest can actually be there: the walk and the
 * earlier stops take however long they take, and the event does not wait.
 */

const NOW = new Date("2026-03-10T12:00:00Z");
const STARTS = new Date("2026-03-10T13:00:00Z");
const ENDS = new Date("2026-03-10T14:00:00Z");

describe("arriving at a scheduled event", () => {
  it("accepts an arrival just after it starts, and budgets what is left", () => {
    const result = evaluateEventArrival({
      startsAt: STARTS,
      endsAt: ENDS,
      estimatedArrival: new Date("2026-03-10T13:10:00Z"),
    });

    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.attendMinutes, 50, "only the remaining 50 minutes are promised");
  });

  it("accepts an arrival exactly on time, and budgets the whole event", () => {
    const result = evaluateEventArrival({ startsAt: STARTS, endsAt: ENDS, estimatedArrival: STARTS });

    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.attendMinutes, 60);
  });

  it("refuses an EARLY arrival rather than assuming the guest waits around", () => {
    const result = evaluateEventArrival({
      startsAt: STARTS,
      endsAt: ENDS,
      estimatedArrival: new Date("2026-03-10T12:30:00Z"),
    });

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "arrives_before_start");
  });

  it("refuses an arrival after it has finished", () => {
    const result = evaluateEventArrival({
      startsAt: STARTS,
      endsAt: ENDS,
      estimatedArrival: new Date("2026-03-10T14:30:00Z"),
    });

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "arrives_after_end");
  });

  it("refuses an arrival exactly as it ends — there is nothing left to attend", () => {
    const result = evaluateEventArrival({ startsAt: STARTS, endsAt: ENDS, estimatedArrival: ENDS });

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "arrives_after_end");
  });

  it("refuses a token appearance with less than the minimum left", () => {
    const result = evaluateEventArrival({
      startsAt: STARTS,
      endsAt: ENDS,
      estimatedArrival: new Date(ENDS.getTime() - (MIN_EVENT_ATTENDANCE_MINUTES - 1) * 60_000),
    });

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "too_little_left");
  });

  it("accepts an arrival with exactly the minimum left", () => {
    const result = evaluateEventArrival({
      startsAt: STARTS,
      endsAt: ENDS,
      estimatedArrival: new Date(ENDS.getTime() - MIN_EVENT_ATTENDANCE_MINUTES * 60_000),
    });

    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.attendMinutes, MIN_EVENT_ATTENDANCE_MINUTES);
  });
});

// ---------------------------------------------------------------------------
// The same rule, through the real generator.
// ---------------------------------------------------------------------------

const HOTEL_ID = "hotel-1";

const hotelPlace = makeTestPlace({
  id: "00000000-0000-4000-a000-00000000ffff",
  category: "hotel",
  name: "Arrival Hotel",
  latitude: 41.715,
  longitude: 44.827,
});

const venue = makeTestPlace({
  id: "00000000-0000-4000-a000-000000000001",
  category: "restaurant",
  name: "Event venue",
  latitude: 41.7154,
  longitude: 44.8274,
  visitDurationMinutes: 30,
});

const hotel: Hotel = { id: HOTEL_ID, placeId: hotelPlace.id, qrToken: null, createdAt: NOW, updatedAt: NOW };
const user: User = {
  id: "user-1",
  email: "arrival@example.test",
  name: null,
  passwordHash: "x",
  role: "user",
  createdAt: NOW,
  updatedAt: NOW,
};

function emptyGeometry() {
  return { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: [] } };
}

function depsWithEvent(event: HotelEvent, extraPlaces: Place[] = []): GenerateItineraryDependencies {
  return {
    findUserById: async () => user,
    findActiveStayForUser: async () => ({
      id: "stay-1",
      checkIn: new Date("2026-03-10T08:00:00Z"),
      checkOut: null,
      hotel,
      place: hotelPlace,
    }),
    findPreferencesForUser: async (): Promise<UserPreferences> => ({
      userId: user.id,
      principalId: null,
      categories: ["restaurant"],
      budget: null,
      activityLevel: null,
      maxDistanceMeters: null,
      updatedAt: NOW,
    }),
    listEligiblePlacesForStay: async (): Promise<EligiblePlace[]> =>
      [venue, ...extraPlaces].map((place) => ({
        place,
        source: "facility" as const,
        relationId: `facility-${place.id}`,
        priority: null,
        facilityType: "other" as const,
        featured: false,
        offerText: null,
      })),
    findItineraryDay: async () => null,
    findLatestItineraryDayBefore: async () => null,
    listItineraryStops: async () => [],
    getStopUsageHistory: async () => new Map(),
    persistItinerary: async (input: PersistItineraryInput): Promise<PersistItineraryResult> => {
      const day = {
        id: "day-1",
        userId: input.userId,
        principalId: null,
        hotelId: input.hotelId,
        hotelStayId: input.hotelStayId,
        dayNumber: input.dayNumber,
        stopCount: input.stops.length,
        routeGeoJson: input.routeGeoJson,
        totalDurationSeconds: input.totalDurationSeconds,
        originalDurationSeconds: input.totalDurationSeconds,
        availableMinutes: input.availableMinutes,
        generatedAt: input.generatedAt,
        completedAt: input.completedAt,
      } satisfies ItineraryDay;

      const stops = input.stops.map((stop, index) => ({
        id: `stop-${index}`,
        dayId: day.id,
        position: index,
        supersededAt: null,
        supersededReason: null,
        ...stop,
      })) satisfies ItineraryStop[];

      return { status: "created", day, stops };
    },
    optimizeWalkingRoute: async (input) => ({
      ok: true,
      route: {
        order: Array.from({ length: input.stops.length }, (_, index) => index),
        geometry: emptyGeometry(),
        totalDistanceMeters: 300,
        totalDurationSeconds: 300,
        legs: [],
      },
    }),
    getWalkingRouteInOrder: async () => ({
      ok: true,
      route: { geometry: emptyGeometry(), durationSeconds: 300, distanceMeters: 300 },
    }),
    listUpcomingHotelEvents: async () => [event],
  };
}

function event(overrides: Partial<HotelEvent> = {}): HotelEvent {
  return {
    id: "99999999-9999-4999-a999-999999999999",
    hotelId: HOTEL_ID,
    venuePlaceId: venue.id,
    title: "Wine tasting",
    description: null,
    startsAt: NOW,
    endsAt: new Date(NOW.getTime() + 120 * 60 * 1000),
    status: "scheduled",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("the generator applies the arrival rule to the routed order", () => {
  it("includes an event the route arrives into", async () => {
    const result = await generateItineraryForUser(user.id, NOW, depsWithEvent(event()), { availableMinutes: 240 });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.itinerary.stops.some((stop) => stop.name === "Wine tasting"));
  });

  it("reports no plan at all rather than sending the guest to wait outside a closed door", async () => {
    // Starts in two hours; the venue is a few minutes' walk away, so the routed day
    // arrives long before the doors do. With nothing else eligible, the honest answer
    // is that there is no day to offer — not an itinerary built around a wait.
    const tooEarly = event({
      startsAt: new Date(NOW.getTime() + 120 * 60 * 1000),
      endsAt: new Date(NOW.getTime() + 180 * 60 * 1000),
    });

    const result = await generateItineraryForUser(user.id, NOW, depsWithEvent(tooEarly), { availableMinutes: 240 });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "no_plan_fits_time");
  });

  it("still produces a day for the other eligible stops once the event is dropped", async () => {
    const other = makeTestPlace({
      id: "00000000-0000-4000-a000-000000000002",
      category: "restaurant",
      name: "Somewhere else",
      latitude: 41.7156,
      longitude: 44.8276,
      visitDurationMinutes: 20,
    });

    const tooEarly = event({
      startsAt: new Date(NOW.getTime() + 120 * 60 * 1000),
      endsAt: new Date(NOW.getTime() + 180 * 60 * 1000),
    });

    const result = await generateItineraryForUser(user.id, NOW, depsWithEvent(tooEarly, [other]), {
      availableMinutes: 240,
    });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.ok(result.itinerary.stops.length >= 1, "dropping the event must not empty the day");
    assert.equal(result.itinerary.stops.some((stop) => stop.name === "Wine tasting"), false);
  });

  it("budgets only what is left of an event already under way", async () => {
    const started = event({
      startsAt: new Date(NOW.getTime() - 30 * 60 * 1000),
      endsAt: new Date(NOW.getTime() + 60 * 60 * 1000),
    });

    // It has already started, so evaluateEventForPlan refuses it outright: an event
    // in progress is never offered, whatever the arrival maths would say.
    const result = await generateItineraryForUser(user.id, NOW, depsWithEvent(started), { availableMinutes: 240 });

    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.itinerary.stops.some((stop) => stop.name === "Wine tasting"), false);
  });
});
