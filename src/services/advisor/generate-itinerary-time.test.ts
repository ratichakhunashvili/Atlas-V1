import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Hotel, HotelEvent, ItineraryDay, ItineraryStop, Place, User, UserPreferences } from "@/db/schema";
import type { EligiblePlace } from "@/services/eligibility/rules";
import type { PersistItineraryInput, PersistItineraryResult } from "@/db/queries/itinerary";
import {
  DEFAULT_AVAILABLE_MINUTES,
  generateItineraryForUser,
  type GenerateItineraryDependencies,
} from "./generate-itinerary";
import { makeTestPlace } from "./test-utils";

/**
 * The time-aware Advisor, end to end over injected fakes: does the plan actually
 * fit the free time the guest said they had, and does the shape of the day follow
 * the product rules (hotel activity at an end, at most one compatible event)?
 */

const NOW = new Date("2026-03-10T12:00:00Z");
const HOTEL_ID = "hotel-1";
const STAY_CHECK_IN_DAY_ONE = new Date("2026-03-10T08:00:00Z");
const STAY_CHECK_IN_DAY_TWO = new Date("2026-03-09T08:00:00Z");

let placeCounter = 0;
function place(overrides: Partial<Place> & { category: Place["category"] }): Place {
  placeCounter += 1;
  return makeTestPlace({
    id: `00000000-0000-4000-9000-${String(placeCounter).padStart(12, "0")}`,
    name: `Place ${placeCounter}`,
    // A few hundred metres from the hotel unless a test says otherwise.
    latitude: 41.715 + placeCounter * 0.0015,
    longitude: 44.827,
    ...overrides,
  });
}

const hotelPlace = makeTestPlace({
  id: "00000000-0000-4000-9000-00000000ffff",
  category: "hotel",
  name: "Test Hotel",
  latitude: 41.715,
  longitude: 44.827,
});

const hotel: Hotel = {
  id: HOTEL_ID,
  placeId: hotelPlace.id,
  qrToken: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const user: User = {
  id: "user-1",
  email: "guest@example.test",
  passwordHash: "x",
  role: "user",
  createdAt: NOW,
  updatedAt: NOW,
};

function emptyGeometry() {
  return { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: [] } };
}

type Options = {
  facilities?: Place[];
  partners?: Place[];
  events?: HotelEvent[];
  checkIn?: Date;
  /** Walking seconds the fake router reports for any route it is asked for. */
  routeSeconds?: number;
};

function buildDeps(options: Options) {
  const facilities = options.facilities ?? [];
  const partners = options.partners ?? [];
  const routeSeconds = options.routeSeconds ?? 600;

  let persisted: { day: ItineraryDay; stops: ItineraryStop[] } | null = null;

  const deps: GenerateItineraryDependencies = {
    findUserById: async () => user,
    findActiveStayForUser: async () => ({
      id: "stay-1",
      checkIn: options.checkIn ?? STAY_CHECK_IN_DAY_ONE,
      checkOut: null,
      hotel,
      place: hotelPlace,
    }),
    findPreferencesForUser: async (): Promise<UserPreferences> => ({
      userId: user.id,
      principalId: null,
      categories: ["restaurant", "spa", "museum"],
      budget: null,
      activityLevel: null,
      maxDistanceMeters: null,
      updatedAt: NOW,
    }),
    listEligiblePlacesForStay: async (): Promise<EligiblePlace[]> => [
      ...partners.map((p) => ({
        place: p,
        source: "partner" as const,
        relationId: `partnership-${p.id}`,
        priority: null,
        facilityType: null,
      })),
      ...facilities.map((p) => ({
        place: p,
        source: "facility" as const,
        relationId: `facility-${p.id}`,
        priority: null,
        facilityType: "other" as const,
      })),
    ],
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

      persisted = { day, stops };
      return { status: "created", day, stops };
    },
    optimizeWalkingRoute: async (input) => ({
      ok: true,
      route: {
        order: Array.from({ length: input.stops.length }, (_, index) => index),
        geometry: emptyGeometry(),
        totalDistanceMeters: 500,
        totalDurationSeconds: routeSeconds,
        legs: [],
      },
    }),
    getWalkingRouteInOrder: async () => ({
      ok: true,
      route: { geometry: emptyGeometry(), durationSeconds: routeSeconds, distanceMeters: 500 },
    }),
    listUpcomingHotelEvents: async () => options.events ?? [],
  };

  return { deps, getPersisted: () => persisted };
}

/** Partners a short walk from the hotel, so these tests exercise the budget rather than the distance filter. */
function quickPartners(count: number, visitMinutes: number): Place[] {
  return Array.from({ length: count }, (_, index) =>
    place({
      category: "restaurant",
      visitDurationMinutes: visitMinutes,
      latitude: 41.715 + index * 0.0004,
      longitude: 44.827 + index * 0.0004,
    })
  );
}

describe("the plan is fitted to the guest's free time", () => {
  it("fits more into a longer window — the answer actually changes the day", async () => {
    const partners = quickPartners(6, 40);

    const short = await generateItineraryForUser(user.id, NOW, buildDeps({ partners }).deps, { availableMinutes: 60 });
    const long = await generateItineraryForUser(user.id, NOW, buildDeps({ partners }).deps, { availableMinutes: 240 });

    assert.equal(short.ok, true);
    assert.equal(long.ok, true);
    if (!short.ok || !long.ok) return;

    assert.ok(
      long.itinerary.stops.length > short.itinerary.stops.length,
      `expected a longer window to allow more stops (60min: ${short.itinerary.stops.length}, 240min: ${long.itinerary.stops.length})`
    );
  });

  it("records the window and each stop's expected visit time with the plan", async () => {
    const { deps } = buildDeps({ partners: quickPartners(2, 20) });

    const result = await generateItineraryForUser(user.id, NOW, deps, { availableMinutes: 180 });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.itinerary.day.availableMinutes, 180);
    for (const stop of result.itinerary.stops) {
      assert.equal(stop.visitDurationMinutes, 20);
    }
  });

  it("gives an unconfigured Place its category estimate, never zero", async () => {
    const { deps } = buildDeps({ partners: [place({ category: "museum", visitDurationMinutes: null })] });

    const result = await generateItineraryForUser(user.id, NOW, deps, { availableMinutes: 240 });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.ok((result.itinerary.stops[0].visitDurationMinutes ?? 0) > 0);
  });

  it("keeps the real walk plus every visit inside the window", async () => {
    // 50 minutes of walking however many stops there are: a four-stop day of
    // 10-minute visits cannot fit 60 minutes, so stops have to go.
    const { deps } = buildDeps({ partners: quickPartners(4, 10), routeSeconds: 3000 });

    const result = await generateItineraryForUser(user.id, NOW, deps, { availableMinutes: 60 });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const walkMinutes = (result.itinerary.day.totalDurationSeconds ?? 0) / 60;
    const visitMinutes = result.itinerary.stops.reduce((total, stop) => total + (stop.visitDurationMinutes ?? 0), 0);

    assert.ok(walkMinutes + visitMinutes <= 60, `walk ${walkMinutes} + visits ${visitMinutes} must fit 60`);
    assert.ok(result.itinerary.stops.length >= 1, "a day that fits is still a day");
  });

  it("says so plainly when not even one experience fits, instead of inventing a day", async () => {
    const { deps } = buildDeps({ partners: [place({ category: "spa", visitDurationMinutes: 600 })] });

    const result = await generateItineraryForUser(user.id, NOW, deps, { availableMinutes: 60 });

    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.reason, "no_plan_fits_time");
    assert.match(result.message, /60 minutes/);
  });

  it("ignores a window a client made up, falling back to the documented default", async () => {
    const { deps } = buildDeps({ partners: quickPartners(2, 10) });

    const result = await generateItineraryForUser(user.id, NOW, deps, { availableMinutes: 100_000 });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.itinerary.day.availableMinutes, DEFAULT_AVAILABLE_MINUTES);
  });
});

describe("where the hotel's own activity sits", () => {
  const facility = () => place({ category: "spa", visitDurationMinutes: 15 });

  it("opens day 1 with it and closes day 2 with it, never putting it in the middle", async () => {
    const partners = quickPartners(3, 10);
    const spa = facility();

    const dayOne = await generateItineraryForUser(
      user.id,
      NOW,
      buildDeps({ partners, facilities: [spa], checkIn: STAY_CHECK_IN_DAY_ONE }).deps,
      { availableMinutes: 240 }
    );
    const dayTwo = await generateItineraryForUser(
      user.id,
      NOW,
      buildDeps({ partners, facilities: [spa], checkIn: STAY_CHECK_IN_DAY_TWO }).deps,
      { availableMinutes: 240 }
    );

    assert.equal(dayOne.ok, true);
    assert.equal(dayTwo.ok, true);
    if (!dayOne.ok || !dayTwo.ok) return;

    const first = dayOne.itinerary.stops.findIndex((stop) => stop.placeId === spa.id);
    const second = dayTwo.itinerary.stops.findIndex((stop) => stop.placeId === spa.id);

    assert.notEqual(first, -1, "an eligible facility that fits should be included");
    assert.equal(first, 0, "day 1 opens with the hotel's own activity");

    assert.notEqual(second, -1);
    assert.equal(second, dayTwo.itinerary.stops.length - 1, "day 2 closes with it instead");
  });
});

describe("scheduled hotel events", () => {
  const venue = place({ category: "restaurant", visitDurationMinutes: 30 });

  function event(overrides: Partial<HotelEvent> = {}): HotelEvent {
    return {
      id: "99999999-9999-4999-8999-999999999999",
      hotelId: HOTEL_ID,
      venuePlaceId: venue.id,
      title: "Wine tasting",
      description: null,
      startsAt: NOW,
      endsAt: new Date(NOW.getTime() + 180 * 60 * 1000),
      status: "scheduled",
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  async function planWith(events: HotelEvent[], availableMinutes: 60 | 120 | 180 | 240 = 240) {
    const { deps } = buildDeps({ facilities: [venue], partners: quickPartners(2, 10), events });
    const result = await generateItineraryForUser(user.id, NOW, deps, { availableMinutes });
    assert.equal(result.ok, true);
    return result.ok ? result.itinerary.stops : [];
  }

  it("includes a compatible event as a visit to its canonical venue Place", async () => {
    const stops = await planWith([event()]);
    const eventStop = stops.find((stop) => stop.name === "Wine tasting");

    assert.ok(eventStop, "a compatible event should be offered");
    assert.equal(eventStop?.placeId, venue.id, "the event does not duplicate its venue as a new Place");
    const fullLength = 180;
    const budgeted = eventStop?.visitDurationMinutes ?? 0;
    assert.ok(budgeted > 0 && budgeted <= fullLength, "what is LEFT of the event is budgeted, never more than the event has to give");
  });

  it("never includes a cancelled event, however well it would fit", async () => {
    const stops = await planWith([event({ status: "cancelled" })]);
    assert.equal(stops.some((stop) => stop.name === "Wine tasting"), false);
  });

  it("never includes an event that would run past the guest's free time", async () => {
    const stops = await planWith(
      [event({ startsAt: new Date(NOW.getTime() + 60 * 60 * 1000), endsAt: new Date(NOW.getTime() + 300 * 60 * 1000) })],
      120
    );
    assert.equal(stops.some((stop) => stop.name === "Wine tasting"), false);
  });

  it("never includes another hotel's event", async () => {
    const stops = await planWith([event({ hotelId: "some-other-hotel" })]);
    assert.equal(stops.some((stop) => stop.name === "Wine tasting"), false);
  });

  it("includes at most one event, even when several would fit", async () => {
    const stops = await planWith([
      event({ id: "99999999-9999-4999-8999-99999999aaaa", title: "Tasting A" }),
      event({
        id: "99999999-9999-4999-8999-99999999bbbb",
        title: "Tasting B",
        startsAt: NOW,
        endsAt: new Date(NOW.getTime() + 150 * 60 * 1000),
      }),
    ]);

    const eventStops = stops.filter((stop) => stop.name.startsWith("Tasting"));
    assert.equal(eventStops.length, 1);
  });
});
