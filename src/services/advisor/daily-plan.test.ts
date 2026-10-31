import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { Hotel, ItineraryDay, ItineraryStop, Place, PlaceCategory, UserPreferences } from "@/db/schema";
import type { GuestStay } from "@/services/eligibility";
import type { EligiblePlace } from "@/services/eligibility/rules";
import { MAX_DAILY_ACTIVITIES } from "./daily-choices";
import {
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
const bistro = place("bistro", 4);
const deli = place("deli", 5);
const decoy = place("decoy-nearby", 1); // in Atlas, next door, partnered with nobody

const stays: Record<string, GuestStay> = {
  [GUEST_A]: { id: "stay-a", checkIn: new Date("2026-06-14T10:00:00Z"), checkOut: null, hotel: { id: "hotel-a" } as Hotel, place: hotelAPlace },
  [GUEST_B]: { id: "stay-b", checkIn: new Date("2026-06-14T10:00:00Z"), checkOut: null, hotel: { id: "hotel-b" } as Hotel, place: hotelBPlace },
};

const entry = (p: Place, source: "partner" | "facility" = "partner"): EligiblePlace => ({
  place: p,
  source,
  relationId: `${source}-${p.id}`,
  priority: null,
  facilityType: source === "facility" ? "other" : null,
  featured: false,
  offerText: null,
});

let eligibleByHotel: Record<string, EligiblePlace[]>;
let preferences: Record<string, UserPreferences | null>;
let days: ItineraryDay[];
let stops: ItineraryStop[];
let badges: Map<string, string>;
let visits: string[];

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
    [GUEST_A]: prefs(GUEST_A, ["restaurant", "spa", "tour"]),
    [GUEST_B]: prefs(GUEST_B, ["restaurant", "spa", "tour"]),
  };
  days = [];
  stops = [];
  badges = new Map();
  visits = [];
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
    preferences[GUEST_A] = prefs(GUEST_A, ["museum"]);
    assert.deepEqual(await startDayForUser(GUEST_A, 120, NOW, deps()), { ok: false, reason: "no_eligible_experiences" });
    assert.equal(days.length, 0, "the guest's one day is not used up");
  });

  it("starts once a day only", async () => {
    assert.deepEqual(await startDayForUser(GUEST_A, 120, NOW, deps()), { ok: true });
    assert.deepEqual(await startDayForUser(GUEST_A, 240, NOW, deps()), { ok: false, reason: "already_started" });
    assert.equal(days.length, 1);
  });
});

describe("daily plan: choosing 1 of 3 (hotel-specific eligibility)", () => {
  it("offers three of Hotel A's own facilities and partners, never a nearby non-partner", async () => {
    await startDayForUser(GUEST_A, 120, NOW, deps());
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
});
