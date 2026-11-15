import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { Hotel, ItineraryDay, ItineraryStop, Place, PlaceCategory, UserPreferences } from "@/db/schema";
import type { GuestStay } from "@/services/eligibility";
import type { EligiblePlace } from "@/services/eligibility/rules";
import { MAX_DAILY_ACTIVITIES } from "./daily-choices";
import {
  restartTodayForTesting,
  simulateScanForTesting,
  getDailyPlanForUser,
  pickChoiceForUser,
  startDayForUser,
  type DailyPlanDependencies,
} from "./daily-plan";
import { makeTestPlace } from "./test-utils";

const NOW = new Date("2026-06-15T12:00:00Z");
const GUEST_A = "guest-a";
const GUEST_B = "guest-b";
const NO_STAY = "guest-none";

const at = (n: number) => ({ latitude: 41.7 + n * 0.001, longitude: 44.8 });
const hotelAPlace = makeTestPlace({ id: "hotel-a-place", name: "Hotel A", category: "hotel", ...at(0) });
const hotelBPlace = makeTestPlace({ id: "hotel-b-place", name: "Hotel B", category: "hotel", ...at(0) });
const place = (id: string, n: number, category: PlaceCategory = "restaurant") =>
  makeTestPlace({ id, name: id, category, visitDurationMinutes: 20, ...at(n) });

const sauna = place("sauna", 1, "spa");
const cafe = place("cafe", 2);
const tour = place("tour", 3, "tour");
// Different category groups: a day holds at most one place per group (category-groups.ts).
const bistro = place("bistro", 4, "museum");
const deli = place("deli", 5, "nature");
const decoy = place("decoy-nearby", 1); // in Atlas, next door, partnered with nobody

const stays: Record<string, GuestStay> = {
  [GUEST_A]: { id: "stay-a", checkIn: new Date("2026-06-14T10:00:00Z"), checkOut: null, hotel: { id: "hotel-a" } as Hotel, place: hotelAPlace },
  [GUEST_B]: { id: "stay-b", checkIn: new Date("2026-06-14T10:00:00Z"), checkOut: null, hotel: { id: "hotel-b" } as Hotel, place: hotelBPlace },
};

const entry = (p: Place, source: "partner" | "facility" = "partner"): EligiblePlace => ({
  place: p,
  source,
  relationId: `${source}-${p.id}`,
  facilityType: source === "facility" ? "other" : null,
  promotion: source === "partner" ? { partnershipId: `promotion-${p.id}`, priority: null, featured: false, offerText: null } : null,
});

let eligibleByHotel: Record<string, EligiblePlace[]>;
let preferences: Record<string, UserPreferences | null>;
let days: ItineraryDay[];
let stops: ItineraryStop[];
let badges: Map<string, string>;
let visits: string[];
/** Days the guest has already given private feedback for (Phase 2). */
let feedbackGiven: Set<string>;
/** Each hotel's day program (hotel_day_program_steps), by hotel id. */
let programs: Record<string, { position: number; placeIds: string[] }[]>;

function deps(): DailyPlanDependencies {
  return {
    resolveGuestHotelContext: async (userId) => (stays[userId] ? { ok: true, stay: stays[userId] } : { ok: false, reason: "no_active_stay" }),
    findPreferencesForUser: async (userId) => preferences[userId] ?? null,
    listEligiblePlacesForStay: async (stay) => eligibleByHotel[stay.hotel.id] ?? [],
    findItineraryDay: async (userId, hotelId, dayNumber) =>
      days.find((day) => day.userId === userId && day.hotelId === hotelId && day.dayNumber === dayNumber) ?? null,
    listItineraryStops: async (dayId) => stops.filter((stop) => stop.dayId === dayId && !stop.supersededAt),
    getStopUsageHistory: async () => new Map(),
    createEmptyItineraryDay: async (input) => {
      if (days.some((day) => day.userId === input.userId && day.hotelId === input.hotelId && day.dayNumber === input.dayNumber)) return null;
      const day = {
        id: `day-${days.length + 1}`,
        userId: input.userId,
        principalId: null,
        hotelId: input.hotelId,
        hotelStayId: input.hotelStayId,
        dayNumber: input.dayNumber,
        stopCount: 0,
        routeGeoJson: null,
        totalDurationSeconds: null,
        originalDurationSeconds: null,
        availableMinutes: input.availableMinutes,
        generatedAt: input.now,
        completedAt: null,
      } as ItineraryDay;
      days.push(day);
      return day;
    },
    appendPickedStop: async ({ dayId, maxActivities, stop }) => {
      const active = stops.filter((s) => s.dayId === dayId && !s.supersededAt);
      if (active.some((s) => s.visitedAt === null)) return { ok: false, reason: "busy" };
      if (active.length >= maxActivities) return { ok: false, reason: "limit" };
      const row = {
        id: `stop-${stops.length + 1}`,
        dayId,
        position: active.length,
        isHotelStop: false,
        visitedAt: null,
        supersededAt: null,
        supersededReason: null,
        ...stop,
      } as unknown as ItineraryStop;
      stops.push(row);
      return { ok: true, stop: row };
    },
    ensureDefaultAchievement: async ({ placeId, placeName }) => {
      if (!badges.has(placeId)) badges.set(placeId, `Visited ${placeName}`);
    },
    markStopVisited: async (stopId) => {
      const stop = stops.find((s) => s.id === stopId && s.visitedAt === null);
      if (!stop) return null;
      stop.visitedAt = NOW;
      return { stop, dayCompleted: false };
    },
    recordVerifiedVisit: async ({ placeId }) => {
      visits.push(placeId);
    },
    setDayAside: async (dayId, now) => {
      const day = days.find((d) => d.id === dayId && d.dayNumber > 0);
      if (!day) return false;
      day.dayNumber = -Math.floor(now.getTime() / 1000);
      for (const s of stops) if (s.dayId === dayId && !s.visitedAt && !s.supersededAt) s.supersededAt = now;
      return true;
    },
    listDayProgram: async (hotelId) => programs[hotelId] ?? [],
    listFeedbackCandidates: async (userId) =>
      days
        .filter((day) => day.userId === userId && day.dayNumber > 0 && !feedbackGiven.has(day.id))
        .map((day) => ({
          dayId: day.id,
          dayNumber: day.dayNumber,
          hasFeedback: false,
          visitedStops: stops.filter((stop) => stop.dayId === day.id && stop.visitedAt !== null).length,
        })),
  };
}

const prefs = (userId: string, categories: PlaceCategory[]): UserPreferences => ({
  userId,
  principalId: null,
  categories,
  budget: null,
  activityLevel: null,
  maxDistanceMeters: null,
  updatedAt: NOW,
});

beforeEach(() => {
  eligibleByHotel = {
    // Hotel A: its own sauna, and partners cafe/tour/bistro/deli. Hotel B: only the tour, through its OWN row.
    "hotel-a": [entry(sauna, "facility"), entry(cafe), entry(tour), entry(bistro), entry(deli)],
    "hotel-b": [entry(tour)],
  };
  preferences = {
    [GUEST_A]: prefs(GUEST_A, ["restaurant", "spa", "tour", "museum", "nature"]),
    [GUEST_B]: prefs(GUEST_B, ["restaurant", "spa", "tour", "museum", "nature"]),
  };
  days = [];
  stops = [];
  badges = new Map();
  visits = [];
  feedbackGiven = new Set();
  programs = {};
});

async function choicesFor(userId: string) {
  const state = await getDailyPlanForUser(userId, NOW, deps());
  assert.equal(state.status, "choosing");
  return state.status === "choosing" ? state.choices.map((choice) => choice.placeId) : [];
}

describe("daily plan: starting the day", () => {
  it("is not started until the guest asks", async () => {
    assert.deepEqual(await getDailyPlanForUser(GUEST_A, NOW, deps()), { status: "not_started", hotelName: "Hotel A" });
  });

  it("refuses a guest with no stay", async () => {
    assert.deepEqual(await startDayForUser(NO_STAY, 120, NOW, deps()), { ok: false, reason: "no_active_stay" });
    assert.equal(days.length, 0);
  });

  it("refuses free time that is not one of the offered options", async () => {
    assert.deepEqual(await startDayForUser(GUEST_A, 600, NOW, deps()), { ok: false, reason: "invalid_time" });
  });

  it("needs at least one interest", async () => {
    preferences[GUEST_A] = prefs(GUEST_A, []);
    assert.deepEqual(await startDayForUser(GUEST_A, 120, NOW, deps()), { ok: false, reason: "no_preferences" });
  });

  it("saves nothing when the hotel has nothing approved that matches", async () => {
    // Hotel B has no facilities, so the first (campus) step falls back to the interest-filtered options: none.
    preferences[GUEST_B] = prefs(GUEST_B, ["beach"]);
    assert.deepEqual(await startDayForUser(GUEST_B, 120, NOW, deps()), { ok: false, reason: "no_eligible_experiences" });
    assert.equal(days.length, 0, "the guest's one day is not used up");
  });

  it("starts even when no interest matches, if the hotel's own facility fits (the campus step ignores interests)", async () => {
    preferences[GUEST_A] = prefs(GUEST_A, ["beach"]);
    assert.deepEqual(await startDayForUser(GUEST_A, 120, NOW, deps()), { ok: true });
    assert.deepEqual(await choicesFor(GUEST_A), [sauna.id]);
  });

  it("test restart frees today's slot so the day can start again, keeping the old day as history", async () => {
    assert.equal(await restartTodayForTesting(GUEST_A, NOW, deps()), false, "nothing to restart before starting");
    assert.deepEqual(await startDayForUser(GUEST_A, 120, NOW, deps()), { ok: true });
    assert.equal(await restartTodayForTesting(GUEST_A, NOW, deps()), true);
    assert.equal((await getDailyPlanForUser(GUEST_A, NOW, deps())).status, "not_started");
    assert.deepEqual(await startDayForUser(GUEST_A, 240, NOW, deps()), { ok: true });
    assert.equal(days.length, 2, "the first day is kept, not deleted");
  });

  it("starts once a day only", async () => {
    assert.deepEqual(await startDayForUser(GUEST_A, 120, NOW, deps()), { ok: true });
    assert.deepEqual(await startDayForUser(GUEST_A, 240, NOW, deps()), { ok: false, reason: "already_started" });
    assert.equal(days.length, 1);
  });
});

describe("daily plan: private feedback before the next plan (Phase 2)", () => {
  /** An earlier day of Guest A's stay, with one stop; visited or not. */
  function earlierDay(input: { userId?: string; dayNumber?: number; visited: boolean }) {
    const userId = input.userId ?? GUEST_A;
    const day = {
      id: `earlier-${days.length + 1}`,
      userId,
      hotelId: userId === GUEST_A ? "hotel-a" : "hotel-b",
      hotelStayId: userId === GUEST_A ? "stay-a" : "stay-b",
      dayNumber: input.dayNumber ?? 1,
      availableMinutes: 120,
      generatedAt: new Date("2026-06-14T12:00:00Z"),
    } as ItineraryDay;
    days.push(day);
    stops.push({ id: `${day.id}-stop`, dayId: day.id, position: 0, visitedAt: input.visited ? new Date("2026-06-14T13:00:00Z") : null, supersededAt: null } as ItineraryStop);
    return day;
  }

  it("refuses a new plan while an earlier day with a visit has no feedback, and saves nothing", async () => {
    earlierDay({ visited: true });
    assert.deepEqual(await startDayForUser(GUEST_A, 120, NOW, deps()), { ok: false, reason: "feedback_required" });
    assert.equal(days.length, 1, "today's day was not created");
  });

  it("allows the plan once that feedback is given", async () => {
    const day = earlierDay({ visited: true });
    feedbackGiven.add(day.id);
    assert.deepEqual(await startDayForUser(GUEST_A, 120, NOW, deps()), { ok: true });
  });

  it("does not ask about an earlier day on which nothing was visited", async () => {
    earlierDay({ visited: false });
    assert.deepEqual(await startDayForUser(GUEST_A, 120, NOW, deps()), { ok: true });
  });

  it("ignores days set aside by the test-only restart, and other guests' days", async () => {
    earlierDay({ visited: true, dayNumber: -1781438400 });
    earlierDay({ visited: true, userId: GUEST_B });
    assert.deepEqual(await startDayForUser(GUEST_A, 120, NOW, deps()), { ok: true });
  });
});

describe("daily plan: choosing 1 of 3 (hotel-specific eligibility)", () => {
  it("offers three of Hotel A's partners, never a nearby non-partner", async () => {
    await startDayForUser(GUEST_A, 240, NOW, deps());
    await pickChoiceForUser(GUEST_A, sauna.id, NOW, deps()); // 1st: the campus
    await simulateScanForTesting(GUEST_A, NOW, deps());
    await pickChoiceForUser(GUEST_A, cafe.id, NOW, deps()); // 2nd: food
    await simulateScanForTesting(GUEST_A, NOW, deps());
    const offered = await choicesFor(GUEST_A);
    assert.equal(offered.length, 3);
    assert.ok(!offered.includes(decoy.id));
    const hotelA = new Set(eligibleByHotel["hotel-a"].map((e) => e.place.id));
    for (const id of offered) assert.ok(hotelA.has(id));
  });

  it("gives a Hotel B guest only Hotel B's partner, not Hotel A's", async () => {
    await startDayForUser(GUEST_B, 120, NOW, deps());
    assert.deepEqual(await choicesFor(GUEST_B), ["tour"]);
  });

  it("refuses a pick that is not one of the current options (manipulated place id)", async () => {
    await startDayForUser(GUEST_B, 120, NOW, deps());
    for (const placeId of [decoy.id, cafe.id, "not-a-place"]) {
      assert.deepEqual(await pickChoiceForUser(GUEST_B, placeId, NOW, deps()), { ok: false, reason: "not_offered" });
    }
    assert.equal(stops.length, 0);
  });

  it("refuses a pick before the day is started", async () => {
    assert.deepEqual(await pickChoiceForUser(GUEST_A, cafe.id, NOW, deps()), { ok: false, reason: "not_choosing" });
  });
});

describe("daily plan: the day's progress", () => {
  it("shows the picked activity, and offers nothing new until it is done", async () => {
    await startDayForUser(GUEST_A, 240, NOW, deps());
    const [first] = await choicesFor(GUEST_A);
    assert.deepEqual(await pickChoiceForUser(GUEST_A, first, NOW, deps()), { ok: true });

    const state = await getDailyPlanForUser(GUEST_A, NOW, deps());
    assert.equal(state.status, "in_progress");
    assert.equal(state.status === "in_progress" && state.current.placeId, first);
    assert.deepEqual(await pickChoiceForUser(GUEST_A, cafe.id, NOW, deps()), { ok: false, reason: "not_choosing" });
  });

  it("offers new options after the activity is done, never the same place twice", async () => {
    await startDayForUser(GUEST_A, 240, NOW, deps());
    const [first] = await choicesFor(GUEST_A);
    await pickChoiceForUser(GUEST_A, first, NOW, deps());
    const scanned = await simulateScanForTesting(GUEST_A, NOW, deps());
    assert.equal(scanned.ok, true);
    assert.deepEqual(visits, [first], "the visit is recorded like a real check-in");

    const next = await choicesFor(GUEST_A);
    assert.ok(next.length > 0);
    assert.ok(!next.includes(first));
  });

  it("gives every picked place a badge, creating a default when the admin hasn't made one", async () => {
    badges.set(cafe.id, "Cafe regular");
    await startDayForUser(GUEST_A, 240, NOW, deps());
    const [first] = await choicesFor(GUEST_A);
    await pickChoiceForUser(GUEST_A, first, NOW, deps());
    assert.equal(badges.get(first), first === cafe.id ? "Cafe regular" : `Visited ${first}`);
    assert.equal(badges.get(cafe.id), "Cafe regular", "an existing badge is never overwritten");
  });

  it("refuses a simulated scan when there is nothing to check in to", async () => {
    await startDayForUser(GUEST_A, 240, NOW, deps());
    assert.deepEqual(await simulateScanForTesting(GUEST_A, NOW, deps()), { ok: false });
    assert.deepEqual(visits, []);
  });

  it("ends the day after four activities", async () => {
    await startDayForUser(GUEST_A, 240, NOW, deps());
    for (let i = 0; i < MAX_DAILY_ACTIVITIES; i++) {
      const [choice] = await choicesFor(GUEST_A);
      await pickChoiceForUser(GUEST_A, choice, NOW, deps());
      await simulateScanForTesting(GUEST_A, NOW, deps());
    }
    const state = await getDailyPlanForUser(GUEST_A, NOW, deps());
    assert.equal(state.status, "finished");
    assert.equal(state.status === "finished" && state.reason, "limit");
    assert.deepEqual(await pickChoiceForUser(GUEST_A, deli.id, NOW, deps()), { ok: false, reason: "not_choosing" });
  });

  it("ends the day when nothing more fits the time left", async () => {
    await startDayForUser(GUEST_A, 60, NOW, deps());
    const later = new Date(NOW.getTime() + 55 * 60_000);
    const state = await getDailyPlanForUser(GUEST_A, later, deps());
    assert.equal(state.status, "finished");
    assert.equal(state.status === "finished" && state.reason, "no_time");
  });

  it("marks the current activity unavailable when its partnership ends, and won't finish it", async () => {
    await startDayForUser(GUEST_B, 120, NOW, deps());
    await pickChoiceForUser(GUEST_B, tour.id, NOW, deps());
    eligibleByHotel["hotel-b"] = []; // Hotel B's partnership with the tour is revoked

    const state = await getDailyPlanForUser(GUEST_B, NOW, deps());
    assert.equal(state.status, "in_progress");
    assert.equal(state.status === "in_progress" && state.currentAvailable, false);
    assert.deepEqual(await simulateScanForTesting(GUEST_B, NOW, deps()), { ok: false });
  });

  it("never offers a second place from a group the day already has", async () => {
    await startDayForUser(GUEST_A, 240, NOW, deps());
    await pickChoiceForUser(GUEST_A, sauna.id, NOW, deps());
    await simulateScanForTesting(GUEST_A, NOW, deps());
    assert.deepEqual(await pickChoiceForUser(GUEST_A, cafe.id, NOW, deps()), { ok: true });
    await simulateScanForTesting(GUEST_A, NOW, deps());
    const offered = await choicesFor(GUEST_A);
    assert.ok(offered.length > 0);
    assert.ok(!offered.includes(decoy.id) && offered.every((id) => id !== cafe.id));
    const state = await getDailyPlanForUser(GUEST_A, NOW, deps());
    assert.ok(state.status === "choosing" && state.choices.every((choice) => choice.category !== "restaurant" && choice.category !== "nightlife"));
  });
});

describe("daily plan: order of the day (campus, then food, then anything)", () => {
  const visitFirst = async (userId: string) => {
    const [choice] = await choicesFor(userId);
    assert.deepEqual(await pickChoiceForUser(userId, choice, NOW, deps()), { ok: true });
    await simulateScanForTesting(userId, NOW, deps());
    return choice;
  };

  it("1st task: only the hotel's own facilities; 2nd: only food; 3rd: anything eligible", async () => {
    await startDayForUser(GUEST_A, 240, NOW, deps());
    assert.deepEqual(await choicesFor(GUEST_A), [sauna.id], "1st: the campus only");
    await visitFirst(GUEST_A);
    assert.deepEqual(await choicesFor(GUEST_A), [cafe.id], "2nd: food only");
    await visitFirst(GUEST_A);
    const third = await choicesFor(GUEST_A);
    assert.equal(third.length, 3);
    assert.deepEqual(new Set(third), new Set([tour.id, bistro.id, deli.id]));
  });

  it("the campus and food steps ignore interests, but only ever offer eligible places", async () => {
    preferences[GUEST_A] = prefs(GUEST_A, ["tour"]);
    eligibleByHotel["hotel-a"].push(entry(place("bar", 6, "nightlife")));
    await startDayForUser(GUEST_A, 240, NOW, deps());
    assert.deepEqual(await choicesFor(GUEST_A), [sauna.id]);
    await visitFirst(GUEST_A);
    const food = await choicesFor(GUEST_A);
    assert.ok(food.length > 0 && food.every((id) => id === cafe.id || id === "bar"), "restaurant and nightlife count as food");
    assert.ok(!food.includes(decoy.id), "a non-eligible restaurant next door is never offered");
  });

  it("falls back to the normal options when the hotel has no facility", async () => {
    eligibleByHotel["hotel-a"] = eligibleByHotel["hotel-a"].filter((e) => e.source !== "facility");
    await startDayForUser(GUEST_A, 240, NOW, deps());
    assert.equal((await choicesFor(GUEST_A)).length, 3);
  });

  it("falls back to the normal options when no food is eligible (e.g. contracts still pending)", async () => {
    eligibleByHotel["hotel-a"] = eligibleByHotel["hotel-a"].filter((e) => e.place.category !== "restaurant");
    await startDayForUser(GUEST_A, 240, NOW, deps());
    await visitFirst(GUEST_A);
    const second = await choicesFor(GUEST_A);
    assert.deepEqual(new Set(second), new Set([tour.id, bistro.id, deli.id]));
  });

  it("falls back when the campus facility does not fit the time left", async () => {
    const farSauna = place("far-sauna", 400, "spa"); // ~44 km away: never fits
    eligibleByHotel["hotel-a"] = [entry(farSauna, "facility"), ...eligibleByHotel["hotel-a"].filter((e) => e.source !== "facility")];
    await startDayForUser(GUEST_A, 240, NOW, deps());
    const offered = await choicesFor(GUEST_A);
    assert.ok(offered.length > 0 && !offered.includes(farSauna.id));
  });
});

describe("daily plan: the hotel's tasks per day", () => {
  const withLimit = (limit: number) => {
    stays[GUEST_A] = { ...stays[GUEST_A], hotel: { ...stays[GUEST_A].hotel, dailyTaskLimit: limit } };
  };
  const doOne = async () => {
    const [choice] = await choicesFor(GUEST_A);
    assert.deepEqual(await pickChoiceForUser(GUEST_A, choice, NOW, deps()), { ok: true });
    await simulateScanForTesting(GUEST_A, NOW, deps());
  };
  beforeEach(() => withLimit(4));

  for (const limit of [1, 2, 3, 4]) {
    it(`ends the day after ${limit} when the hotel allows ${limit}, and shows "x of ${limit}"`, async () => {
      withLimit(limit);
      await startDayForUser(GUEST_A, 240, NOW, deps());
      for (let i = 0; i < limit; i++) {
        const state = await getDailyPlanForUser(GUEST_A, NOW, deps());
        assert.equal(state.status, "choosing");
        assert.equal(state.status === "choosing" && state.maxPicks, limit);
        await doOne();
      }
      const state = await getDailyPlanForUser(GUEST_A, NOW, deps());
      assert.equal(state.status, "finished");
      assert.equal(state.status === "finished" && state.reason, "limit");
      assert.equal(state.status === "finished" && state.completed.length, limit);
      assert.equal(state.status === "finished" && state.maxPicks, limit);
    });
  }

  it("treats a missing limit as 4, the most there can be", async () => {
    stays[GUEST_A] = { ...stays[GUEST_A], hotel: { id: "hotel-a" } as Hotel };
    await startDayForUser(GUEST_A, 240, NOW, deps());
    const state = await getDailyPlanForUser(GUEST_A, NOW, deps());
    assert.equal(state.status === "choosing" && state.maxPicks, MAX_DAILY_ACTIVITIES);
  });

  it("is read live: lowering it mid-day ends a day that already has that many, but the picked stop can still be done", async () => {
    await startDayForUser(GUEST_A, 240, NOW, deps());
    await doOne();
    const [second] = await choicesFor(GUEST_A);
    await pickChoiceForUser(GUEST_A, second, NOW, deps()); // picked, not yet visited
    withLimit(1);
    const during = await getDailyPlanForUser(GUEST_A, NOW, deps());
    assert.equal(during.status, "in_progress", "the stop already picked can still be completed");
    assert.equal(during.status === "in_progress" && during.maxPicks, 2, "never fewer dots than activities");
    await simulateScanForTesting(GUEST_A, NOW, deps());
    const after = await getDailyPlanForUser(GUEST_A, NOW, deps());
    assert.equal(after.status === "finished" && after.reason, "limit");
    withLimit(3);
    assert.equal((await getDailyPlanForUser(GUEST_A, NOW, deps())).status, "choosing", "raising it lets the day continue");
  });
});

describe("daily plan: the hotel's day program", () => {
  const program = (...steps: string[][]) => {
    programs["hotel-a"] = steps.map((placeIds, i) => ({ position: i + 1, placeIds }));
  };
  const pickAndVisit = async (placeId: string) => {
    assert.deepEqual(await pickChoiceForUser(GUEST_A, placeId, NOW, deps()), { ok: true });
    await simulateScanForTesting(GUEST_A, NOW, deps());
  };

  it("offers exactly the step's eligible places, in the admin's order, ignoring interests and the campus/food order", async () => {
    preferences[GUEST_A] = prefs(GUEST_A, ["tour"]);
    program([deli.id, cafe.id, bistro.id], [tour.id]);
    await startDayForUser(GUEST_A, 240, NOW, deps());
    assert.deepEqual(await choicesFor(GUEST_A), [deli.id, cafe.id, bistro.id]);
  });

  it("skips a listed place that is not eligible and never widens the catalogue", async () => {
    program([decoy.id, "missing-place", cafe.id, hotelAPlace.id]);
    await startDayForUser(GUEST_A, 240, NOW, deps());
    assert.deepEqual(await choicesFor(GUEST_A), [cafe.id]);
    assert.deepEqual(await pickChoiceForUser(GUEST_A, decoy.id, NOW, deps()), { ok: false, reason: "not_offered" });
  });

  it("a guest at another hotel never gets this hotel's program", async () => {
    program([cafe.id]);
    await startDayForUser(GUEST_B, 120, NOW, deps());
    assert.deepEqual(await choicesFor(GUEST_B), [tour.id]);
  });

  it("a 1-place step is mandatory: only that place", async () => {
    program([bistro.id], [cafe.id, deli.id]);
    await startDayForUser(GUEST_A, 240, NOW, deps());
    assert.deepEqual(await choicesFor(GUEST_A), [bistro.id]);
    assert.deepEqual(await pickChoiceForUser(GUEST_A, sauna.id, NOW, deps()), { ok: false, reason: "not_offered" });
  });

  it("allows two places of the same group in a step (the owner's choice) and still shows the return walk", async () => {
    const bar = place("bar", 6);
    eligibleByHotel["hotel-a"].push(entry(bar));
    program([cafe.id, bar.id]);
    await startDayForUser(GUEST_A, 240, NOW, deps());
    const state = await getDailyPlanForUser(GUEST_A, NOW, deps());
    assert.ok(state.status === "choosing");
    assert.deepEqual(state.choices.map((c) => c.placeId), [cafe.id, bar.id]);
    assert.ok(state.choices.every((c) => Number.isFinite(c.returnWalkMinutes)));
  });

  it("shows the step even when the time estimate is tight, and ignores the distance cap", async () => {
    const far = place("far-museum", 400, "museum"); // ~44 km: never fits a normal step
    eligibleByHotel["hotel-a"].push(entry(far));
    preferences[GUEST_A] = { ...prefs(GUEST_A, ["museum"]), maxDistanceMeters: 500 };
    program([far.id]);
    await startDayForUser(GUEST_A, 60, NOW, deps());
    assert.deepEqual(await choicesFor(GUEST_A), [far.id]);
  });

  it("never repeats a place and falls back to the normal step when the program step has nothing eligible left", async () => {
    program([cafe.id], [cafe.id], [decoy.id]);
    await startDayForUser(GUEST_A, 240, NOW, deps());
    await pickAndVisit(cafe.id);
    // Step 2 lists only the cafe, already done today: the normal 2nd step (food) — no food left, so anything.
    const second = await choicesFor(GUEST_A);
    assert.ok(second.length > 0 && !second.includes(cafe.id) && !second.includes(decoy.id));
    await pickAndVisit(second[0]);
    const third = await choicesFor(GUEST_A);
    assert.ok(third.length > 0 && !third.includes(decoy.id), "step 3's only place is not eligible: normal options");
  });

  it("finishes after the last program step, even when the hotel allows more", async () => {
    program([sauna.id, cafe.id], [tour.id]);
    await startDayForUser(GUEST_A, 240, NOW, deps());
    const first = await getDailyPlanForUser(GUEST_A, NOW, deps());
    assert.equal(first.status === "choosing" && first.maxPicks, 2);
    await pickAndVisit(cafe.id);
    assert.deepEqual(await choicesFor(GUEST_A), [tour.id]);
    await pickAndVisit(tour.id);
    const state = await getDailyPlanForUser(GUEST_A, NOW, deps());
    assert.equal(state.status === "finished" && state.reason, "limit");
  });

  it("finishes at the hotel's tasks per day when that is lower than the program", async () => {
    stays[GUEST_A] = { ...stays[GUEST_A], hotel: { ...stays[GUEST_A].hotel, dailyTaskLimit: 1 } };
    try {
      program([sauna.id], [cafe.id], [tour.id]);
      await startDayForUser(GUEST_A, 240, NOW, deps());
      await pickAndVisit(sauna.id);
      const state = await getDailyPlanForUser(GUEST_A, NOW, deps());
      assert.equal(state.status === "finished" && state.reason, "limit");
    } finally {
      stays[GUEST_A] = { ...stays[GUEST_A], hotel: { ...stays[GUEST_A].hotel, dailyTaskLimit: 4 } };
    }
  });

  it("without a program the plan is unchanged (campus first)", async () => {
    await startDayForUser(GUEST_A, 240, NOW, deps());
    assert.deepEqual(await choicesFor(GUEST_A), [sauna.id]);
  });
});
