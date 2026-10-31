import type { CheckInMethod, ItineraryDay, ItineraryStop, PlaceCategory, UserPreferences } from "@/db/schema";
import type { LatLng } from "@/lib/geo";
import type { EligiblePlace } from "@/services/eligibility/rules";
import type { GuestHotelContext, GuestStay } from "@/services/eligibility";
import { buildDailyChoices, MAX_DAILY_ACTIVITIES, type DailyChoice } from "./daily-choices";
import type { UsageHistory } from "./scoring";
import { calculateDayNumber, stayEndFor } from "./stay-day";
import { isAvailableMinutesOption, remainingBudgetMinutes } from "./time-budget";
import { savedStopVisitMinutes } from "./visit-duration";

/*
 * The guest's day as "choose 1 of 3", up to four activities. One day per calendar day of the stay.
 *
 *   start   -> the guest's free time is recorded on a new itinerary day (no stops yet)
 *   choose  -> up to three eligible options that fit the time left (daily-choices.ts)
 *   pick    -> the chosen option becomes the day's one pending stop
 *   visit   -> only after that stop is checked in are new options offered
 *
 * Every decision is made here, on the server, from the guest's own active stay. A pick is accepted only if the
 * Place is one of the options the server would offer right now — a client-supplied place id is a claim, never an
 * instruction.
 */

export type DailyStopView = {
  id: string;
  placeId: string | null;
  name: string;
  category: PlaceCategory | null;
  latitude: number;
  longitude: number;
  checkInMethod: CheckInMethod;
  visitMinutes: number;
  visitedAt: Date | null;
};

type DayBase = {
  dayId: string;
  hotel: { name: string; latitude: number; longitude: number };
  availableMinutes: number | null;
  startedAt: Date;
  /** What is left of the guest's window; null only for a day with no recorded window. */
  remainingMinutes: number | null;
  picksUsed: number;
  maxPicks: number;
  completed: DailyStopView[];
};

export type DailyPlanState =
  | { status: "no_stay"; reason: "no_active_stay" | "outside_stay_period" }
  | { status: "not_started"; hotelName: string }
  | (DayBase & { status: "in_progress"; current: DailyStopView; currentAvailable: boolean })
  | (DayBase & { status: "choosing"; choices: DailyChoice[] })
  | (DayBase & { status: "finished"; reason: "limit" | "no_time" | "nothing_left" });

export type DailyPlanDependencies = {
  resolveGuestHotelContext: (userId: string, now: Date) => Promise<GuestHotelContext>;
  findPreferencesForUser: (userId: string) => Promise<UserPreferences | null>;
  listEligiblePlacesForStay: (stay: GuestStay, now: Date) => Promise<EligiblePlace[]>;
  findItineraryDay: (userId: string, hotelId: string, dayNumber: number) => Promise<ItineraryDay | null>;
  listItineraryStops: (dayId: string) => Promise<ItineraryStop[]>;
  getStopUsageHistory: (userId: string, hotelId: string) => Promise<Map<string, number>>;
  createEmptyItineraryDay: (input: {
    userId: string;
    hotelId: string;
    hotelStayId: string;
    dayNumber: number;
    availableMinutes: number;
    now: Date;
  }) => Promise<ItineraryDay | null>;
  appendPickedStop: (input: {
    dayId: string;
    maxActivities: number;
    stop: {
      placeId: string;
      checkInMethod: CheckInMethod;
      name: string;
      category: PlaceCategory;
      latitude: number;
      longitude: number;
      imageUrl: string | null;
      visitDurationMinutes: number;
    };
  }) => Promise<{ ok: true; stop: ItineraryStop } | { ok: false; reason: "busy" | "limit" }>;
  /** Every daily-plan place unlocks a badge: creates a default one if the admin hasn't made one. */
  ensureDefaultAchievement: (input: { placeId: string; placeName: string }) => Promise<void>;
  /** TEST ONLY path (simulated scan): the same visit + unlock recording a real check-in performs. */
  markStopVisited: (stopId: string, dayId: string) => Promise<unknown>;
  recordVerifiedVisit: (input: { userId: string; placeId: string; method: CheckInMethod; now: Date }) => Promise<unknown>;
};

async function loadDefaultDependencies(): Promise<DailyPlanDependencies> {
  const [eligibilityM, preferencesQ, itineraryQ, achievementsQ, visitsQ] = await Promise.all([
    import("@/services/eligibility"),
    import("@/db/queries/preferences"),
    import("@/db/queries/itinerary"),
    import("@/db/queries/achievements"),
    import("@/db/queries/place-visits"),
  ]);
  return {
    resolveGuestHotelContext: (userId, now) => eligibilityM.resolveGuestHotelContext(userId, now),
    findPreferencesForUser: preferencesQ.findPreferencesForUser,
    listEligiblePlacesForStay: (stay, now) => eligibilityM.listEligiblePlacesForStay(stay, now),
    findItineraryDay: itineraryQ.findItineraryDay,
    listItineraryStops: itineraryQ.listItineraryStops,
    getStopUsageHistory: itineraryQ.getStopUsageHistory,
    createEmptyItineraryDay: itineraryQ.createEmptyItineraryDay,
    appendPickedStop: itineraryQ.appendPickedStop,
    ensureDefaultAchievement: achievementsQ.ensureDefaultAchievementForPlace,
    markStopVisited: itineraryQ.markStopVisited,
    recordVerifiedVisit: visitsQ.recordVerifiedVisit,
  };
}

function toStopView(stop: ItineraryStop): DailyStopView {
  return {
    id: stop.id,
    placeId: stop.placeId,
    name: stop.name,
    category: stop.category,
    latitude: stop.latitude,
    longitude: stop.longitude,
    checkInMethod: stop.checkInMethod,
    visitMinutes: savedStopVisitMinutes(stop).minutes,
    visitedAt: stop.visitedAt,
  };
}

function dayNumberFor(stay: GuestStay, now: Date): number | null {
  const result = calculateDayNumber(stay.checkIn, stayEndFor(stay as GuestStay & { expectedCheckOut?: Date | null }), now);
  return result.ok ? result.dayNumber : null;
}

function choicesFor(input: {
  stay: GuestStay;
  eligible: readonly EligiblePlace[];
  preferences: UserPreferences | null;
  origin: LatLng;
  excludePlaceIds: ReadonlySet<string>;
  remainingMinutes: number;
  usageHistory: UsageHistory;
}): DailyChoice[] {
  return buildDailyChoices({
    eligiblePlaces: input.eligible,
    hotelPlaceId: input.stay.place.id,
    hotelLocation: { lat: input.stay.place.latitude, lng: input.stay.place.longitude },
    origin: input.origin,
    categories: (input.preferences?.categories ?? []) as PlaceCategory[],
    budget: input.preferences?.budget ?? null,
    preferredMaxDistanceMeters: input.preferences?.maxDistanceMeters ?? null,
    excludePlaceIds: input.excludePlaceIds,
    remainingMinutes: input.remainingMinutes,
    usageHistory: input.usageHistory,
  });
}

/** Read-only: what the guest's day looks like right now. Never creates or changes anything. */
export async function getDailyPlanForUser(userId: string, now: Date = new Date(), deps?: DailyPlanDependencies): Promise<DailyPlanState> {
  const d = deps ?? (await loadDefaultDependencies());

  const context = await d.resolveGuestHotelContext(userId, now);
  if (!context.ok) return { status: "no_stay", reason: context.reason };
  const { stay } = context;

  const dayNumber = dayNumberFor(stay, now);
  if (dayNumber === null) return { status: "no_stay", reason: "outside_stay_period" };

  const day = await d.findItineraryDay(userId, stay.hotel.id, dayNumber);
  if (!day) return { status: "not_started", hotelName: stay.place.name };

  const stops = (await d.listItineraryStops(day.id)).slice().sort((a, b) => a.position - b.position);
  const completed = stops.filter((stop) => stop.visitedAt !== null).map(toStopView);
  const pending = stops.find((stop) => stop.visitedAt === null) ?? null;
  const remainingMinutes = remainingBudgetMinutes({ availableMinutes: day.availableMinutes, generatedAt: day.generatedAt, now });

  const base: DayBase = {
    dayId: day.id,
    hotel: { name: stay.place.name, latitude: stay.place.latitude, longitude: stay.place.longitude },
    availableMinutes: day.availableMinutes,
    startedAt: day.generatedAt,
    remainingMinutes,
    picksUsed: stops.length,
    maxPicks: MAX_DAILY_ACTIVITIES,
    completed,
  };

  const eligible = await d.listEligiblePlacesForStay(stay, now);

  if (pending) {
    // Still eligible through THIS hotel? A partnership revoked after the pick makes the stop unavailable.
    const currentAvailable = pending.placeId !== null && eligible.some((entry) => entry.place.id === pending.placeId);
    return { ...base, status: "in_progress", current: toStopView(pending), currentAvailable };
  }

  if (stops.length >= MAX_DAILY_ACTIVITIES) return { ...base, status: "finished", reason: "limit" };

  const preferences = await d.findPreferencesForUser(userId);
  const lastVisited = stops.at(-1);
  const origin = lastVisited ? { lat: lastVisited.latitude, lng: lastVisited.longitude } : { lat: stay.place.latitude, lng: stay.place.longitude };
  const excludePlaceIds = new Set(stops.flatMap((stop) => (stop.placeId ? [stop.placeId] : [])));
  const usageHistory = await d.getStopUsageHistory(userId, stay.hotel.id);
  const shared = { stay, eligible, preferences, origin, excludePlaceIds, usageHistory };

  const choices = choicesFor({ ...shared, remainingMinutes: remainingMinutes ?? 0 });
  if (choices.length > 0) return { ...base, status: "choosing", choices };

  const anyIgnoringTime = choicesFor({ ...shared, remainingMinutes: Number.POSITIVE_INFINITY }).length > 0;
  return { ...base, status: "finished", reason: anyIgnoringTime ? "no_time" : "nothing_left" };
}

export type StartDayResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "no_active_stay"
        | "outside_stay_period"
        | "already_started"
        | "invalid_time"
        | "no_preferences"
        | "no_eligible_experiences"
        | "no_plan_fits_time"
        | "persistence_failed";
    };

/**
 * Starts today. Nothing is saved unless at least one option fits — a day that could offer nothing would only use
 * up the guest's one day for no reason.
 */
export async function startDayForUser(
  userId: string,
  availableMinutes: number,
  now: Date = new Date(),
  deps?: DailyPlanDependencies
): Promise<StartDayResult> {
  const d = deps ?? (await loadDefaultDependencies());
  if (!isAvailableMinutesOption(availableMinutes)) return { ok: false, reason: "invalid_time" };

  const context = await d.resolveGuestHotelContext(userId, now);
  if (!context.ok) return { ok: false, reason: context.reason };
  const { stay } = context;
  const dayNumber = dayNumberFor(stay, now);
  if (dayNumber === null) return { ok: false, reason: "outside_stay_period" };

  if (await d.findItineraryDay(userId, stay.hotel.id, dayNumber)) return { ok: false, reason: "already_started" };

  const preferences = await d.findPreferencesForUser(userId);
  if (!preferences || preferences.categories.length === 0) return { ok: false, reason: "no_preferences" };

  const eligible = await d.listEligiblePlacesForStay(stay, now);
  const usageHistory = await d.getStopUsageHistory(userId, stay.hotel.id);
  const shared = {
    stay,
    eligible,
    preferences,
    origin: { lat: stay.place.latitude, lng: stay.place.longitude },
    excludePlaceIds: new Set<string>(),
    usageHistory,
  };

  if (choicesFor({ ...shared, remainingMinutes: availableMinutes }).length === 0) {
    const anyIgnoringTime = choicesFor({ ...shared, remainingMinutes: Number.POSITIVE_INFINITY }).length > 0;
    return { ok: false, reason: anyIgnoringTime ? "no_plan_fits_time" : "no_eligible_experiences" };
  }

  const day = await d.createEmptyItineraryDay({
    userId,
    hotelId: stay.hotel.id,
    hotelStayId: stay.id,
    dayNumber,
    availableMinutes,
    now,
  });
  // Null = another request created today's day first.
  return day ? { ok: true } : { ok: false, reason: "already_started" };
}

export type PickResult = { ok: true } | { ok: false; reason: "not_choosing" | "not_offered" | "busy" | "limit" };

/** Adds one of the CURRENT options to the day. The place id is checked against what the server offers now. */
export async function pickChoiceForUser(
  userId: string,
  placeId: string,
  now: Date = new Date(),
  deps?: DailyPlanDependencies
): Promise<PickResult> {
  const d = deps ?? (await loadDefaultDependencies());
  const state = await getDailyPlanForUser(userId, now, d);
  if (state.status !== "choosing") return { ok: false, reason: "not_choosing" };

  const choice = state.choices.find((option) => option.placeId === placeId);
  if (!choice) return { ok: false, reason: "not_offered" };

  await d.ensureDefaultAchievement({ placeId: choice.placeId, placeName: choice.name });

  const appended = await d.appendPickedStop({
    dayId: state.dayId,
    maxActivities: MAX_DAILY_ACTIVITIES,
    stop: {
      placeId: choice.placeId,
      checkInMethod: choice.checkInMethod,
      name: choice.name,
      category: choice.category,
      latitude: choice.latitude,
      longitude: choice.longitude,
      imageUrl: choice.imageUrl,
      visitDurationMinutes: choice.visitMinutes,
    },
  });
  return appended.ok ? { ok: true } : appended;
}

/**
 * TEST ONLY: a simulated scan. Completes the current activity the way a real check-in does — the stop is marked
 * visited, then the visit is recorded and the place's badge unlocked — without the QR code or location step.
 * The caller (a server action) must refuse this outside allowed non-production environments.
 */
export async function simulateScanForTesting(
  userId: string,
  now: Date = new Date(),
  deps?: DailyPlanDependencies
): Promise<{ ok: true; stopId: string } | { ok: false }> {
  const d = deps ?? (await loadDefaultDependencies());
  const state = await getDailyPlanForUser(userId, now, d);
  if (state.status !== "in_progress" || !state.currentAvailable || !state.current.placeId) return { ok: false };
  const marked = await d.markStopVisited(state.current.id, state.dayId);
  if (!marked) return { ok: false };
  await d.recordVerifiedVisit({ userId, placeId: state.current.placeId, method: "qr", now });
  return { ok: true, stopId: state.current.id };
}
