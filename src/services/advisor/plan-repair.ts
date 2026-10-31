import type { ItineraryDay, ItineraryStop, User, UserPreferences } from "@/db/schema";
import type { LatLng } from "@/lib/geo";
import type { PersistStopChangeResult, PersistStopRemovalInput, PersistStopReplacementInput } from "@/db/queries/itinerary";
import type { EligiblePlace } from "@/services/eligibility/rules";
import { getWalkingRouteInOrder } from "@/services/routing";
import { buildCandidates, type AdvisorCandidate } from "./candidates";
import type { ActiveHotelStay } from "./generate-itinerary";
import type { UsageHistory } from "./scoring";
import { calculateDayNumber, stayEndFor } from "./stay-day";
import { contextFromEligible, evaluatePendingStops, type StopAvailability } from "./stop-availability";
import { resolveVisitDuration, savedStopVisitMinutes } from "./visit-duration";
import { fitsInBudget, remainingBudgetMinutes } from "./time-budget";
import { chooseStops, resolveCandidateCategories } from "./stop-selection";

/**
 * Explicit plan repair when a PENDING stop has become unavailable. Two guest actions, both server-enforced:
 *
 *  1. replaceUnavailableStopsForUser — replaces ONLY the unavailable pending stops with currently-eligible
 *     Places, keeping every completed stop and every still-available pending stop exactly as they are
 *     (including their order: a replacement takes the vacated slot). Old stops are superseded, never deleted.
 *  2. removeUnavailableStopForUser — when no replacement exists, removes ONE unavailable pending stop so the
 *     guest is not permanently blocked. Its snapshot is kept as history.
 *
 * Neither runs on its own: the route never changes silently. Completed stops are never superseded.
 * Availability is always re-evaluated HERE from the guest's own stay — never trusted from the client.
 * This is NOT a general cooldown bypass: ordinary Generate is untouched.
 */

/** Only these reasons are repairable: the stop's Place stopped being eligible for the guest's CURRENT stay. */
function isRepairable(availability: StopAvailability | undefined): boolean {
  return availability !== undefined && !availability.available && (availability.reason === "not_eligible" || availability.reason === "place_removed");
}

export type PlanRepairDependencies = {
  findUserById: (id: string) => Promise<User | null>;
  findActiveStayForUser: (userId: string) => Promise<ActiveHotelStay | null>;
  findPreferencesForUser: (userId: string) => Promise<UserPreferences | null>;
  findItineraryDay: (userId: string, hotelId: string, dayNumber: number) => Promise<ItineraryDay | null>;
  listItineraryStops: (dayId: string) => Promise<ItineraryStop[]>;
  findItineraryStopWithDay: (stopId: string) => Promise<{ stop: ItineraryStop; day: ItineraryDay } | null>;
  listEligiblePlacesForStay: (stay: Pick<ActiveHotelStay, "hotel" | "place">, now: Date) => Promise<EligiblePlace[]>;
  getStopUsageHistory: (userId: string, hotelId: string) => Promise<Map<string, number>>;
  getWalkingRouteInOrder: typeof getWalkingRouteInOrder;
  persistStopReplacement: (input: PersistStopReplacementInput) => Promise<PersistStopChangeResult>;
  persistStopRemoval: (input: PersistStopRemovalInput) => Promise<PersistStopChangeResult>;
};

async function loadDefaultDependencies(): Promise<PlanRepairDependencies> {
  const [usersQ, staysQ, preferencesQ, itineraryQ, eligibilityM] = await Promise.all([
    import("@/db/queries/users"),
    import("@/db/queries/hotel-stays"),
    import("@/db/queries/preferences"),
    import("@/db/queries/itinerary"),
    import("@/services/eligibility"),
  ]);
  return {
    findUserById: usersQ.findUserById,
    findActiveStayForUser: staysQ.findActiveStayForUser,
    findPreferencesForUser: preferencesQ.findPreferencesForUser,
    findItineraryDay: itineraryQ.findItineraryDay,
    listItineraryStops: itineraryQ.listItineraryStops,
    findItineraryStopWithDay: itineraryQ.findItineraryStopWithDay,
    listEligiblePlacesForStay: (stay, now) => eligibilityM.listEligiblePlacesForStay(stay, now),
    getStopUsageHistory: itineraryQ.getStopUsageHistory,
    getWalkingRouteInOrder,
    persistStopReplacement: itineraryQ.persistStopReplacement,
    persistStopRemoval: itineraryQ.persistStopRemoval,
  };
}

export type PlanRepairFailureReason =
  | "no_active_stay"
  | "outside_stay_period"
  | "no_itinerary"
  | "nothing_to_regenerate"
  | "no_replacement_available"
  | "routing_failed"
  | "conflict";

export type ReplaceUnavailableStopsResult =
  | { ok: true; replaced: number; droppedWithoutReplacement: number; day: ItineraryDay; stops: ItineraryStop[] }
  | { ok: false; reason: PlanRepairFailureReason; message: string; unavailableStops?: Array<{ id: string; name: string }> };

type ResolvedPlan = {
  stay: ActiveHotelStay;
  day: ItineraryDay;
  stops: ItineraryStop[];
  eligible: EligiblePlace[];
  availability: Map<string, StopAvailability>;
};

async function resolvePlan(
  userId: string,
  now: Date,
  d: PlanRepairDependencies
): Promise<{ ok: true; plan: ResolvedPlan } | { ok: false; reason: PlanRepairFailureReason; message: string }> {
  const stay = await d.findActiveStayForUser(userId);
  if (!stay) return { ok: false, reason: "no_active_stay", message: "You need an active hotel stay." };

  const dayNumber = calculateDayNumber(stay.checkIn, stayEndFor(stay), now);
  if (!dayNumber.ok) return { ok: false, reason: "outside_stay_period", message: dayNumber.message };

  const day = await d.findItineraryDay(userId, stay.hotel.id, dayNumber.dayNumber);
  if (!day) return { ok: false, reason: "no_itinerary", message: "You don't have a route for today yet." };

  const stops = (await d.listItineraryStops(day.id)).slice().sort((a, b) => a.position - b.position);
  const eligible = await d.listEligiblePlacesForStay(stay, now);
  const availability = evaluatePendingStops(stops, day, contextFromEligible(stay, eligible, now));
  return { ok: true, plan: { stay, day, stops, eligible, availability } };
}

export async function replaceUnavailableStopsForUser(
  userId: string,
  now: Date = new Date(),
  deps?: PlanRepairDependencies
): Promise<ReplaceUnavailableStopsResult> {
  const d = deps ?? (await loadDefaultDependencies());

  const resolved = await resolvePlan(userId, now, d);
  if (!resolved.ok) return resolved;
  const { stay, day, stops, eligible, availability } = resolved.plan;

  // Server-enforced: this action exists ONLY for the case where a pending stop is unavailable.
  const unavailable = stops.filter((stop) => stop.visitedAt === null && isRepairable(availability.get(stop.id)));
  if (unavailable.length === 0) {
    return { ok: false, reason: "nothing_to_regenerate", message: "None of your remaining stops is unavailable, so there is nothing to update." };
  }
  const unavailableStops = unavailable.map((stop) => ({ id: stop.id, name: stop.name }));

  const user = await d.findUserById(userId);
  const preferences = await d.findPreferencesForUser(userId);
  const categories = resolveCandidateCategories(user?.role === "admin", preferences);

  const hotelLocation: LatLng = { lat: stay.place.latitude, lng: stay.place.longitude };
  const candidates: AdvisorCandidate[] = categories
    ? buildCandidates({ hotelLocation, hotelPlaceId: stay.place.id, eligiblePlaces: eligible, selectedCategories: categories, preferredMaxDistanceMeters: preferences?.maxDistanceMeters ?? null })
    : [];

  // Never re-pick a place already in today's plan (completed or pending), nor one of the unavailable stops.
  const exclude = new Set(stops.flatMap((stop) => (stop.placeId ? [stop.placeId] : [])));
  const usageHistory: UsageHistory = await d.getStopUsageHistory(userId, stay.hotel.id);
  const chosen = chooseStops({ candidates, usageHistory, targetCount: unavailable.length, excludePlaceIds: exclude, preferences: { budget: preferences?.budget ?? null } });

  if (chosen.length === 0) {
    // Nothing is changed. The guest is offered an explicit removal of the unavailable stop instead.
    return {
      ok: false,
      reason: "no_replacement_available",
      message: "No other approved experience matches your interests right now. You can remove the unavailable stop to continue.",
      unavailableStops,
    };
  }

  // A replacement takes the vacated slot of the stop it replaces, so stop order is preserved. Fewer
  // replacements than unavailable stops means the plan simply gets shorter (never a repeat or substitute).
  const allReplacements = chosen.map((candidate, index) => ({
    position: unavailable[index].position,
    stop: {
      placeId: candidate.place.id,
      isHotelStop: false,
      checkInMethod: candidate.isPartner || candidate.place.category === "landmark" || candidate.place.category === "historical" ? ("qr" as const) : ("gps" as const),
      name: candidate.place.name,
      category: candidate.place.category,
      latitude: candidate.place.latitude,
      longitude: candidate.place.longitude,
      imageUrl: candidate.place.imageUrl,
      // A replacement is budgeted like any other stop (services/advisor/visit-duration.ts).
      visitDurationMinutes: resolveVisitDuration(candidate.place).minutes,
      visitedAt: null,
    },
  }));

  const unavailableIds = new Set(unavailable.map((stop) => stop.id));
  const retained = stops.filter((stop) => stop.visitedAt === null && !unavailableIds.has(stop.id));

  /*
   * A repair must not quietly hand the guest a longer day than the one they asked
   * for. The plan was fitted to `day.availableMinutes` when it was generated, so the
   * repaired remainder is held to that same window: real routed walking time plus
   * the time at every pending stop.
   *
   * If the best replacements overrun it, fewer are offered — dropping the
   * lowest-ranked first — until the day fits again. Dropping to none means there is
   * no replacement this guest has time for, which is reported exactly like having no
   * eligible replacement at all: the explicit removal action remains open.
   *
   * The budget is what is LEFT of that window, measured from when the plan was
   * generated: a guest ninety minutes into a two-hour afternoon has thirty minutes
   * to spend, not two hours. `day.availableMinutes` keeps recording the original
   * window — a repair does not get to revise what the guest asked for.
   *
   * A plan generated before windows existed (`availableMinutes === null`) is left
   * alone rather than retro-fitted to a budget it was never built for.
   */
  const budgetMinutes = remainingBudgetMinutes({
    availableMinutes: day.availableMinutes,
    generatedAt: day.generatedAt,
    now,
  });

  let replacements = allReplacements;
  let route: Awaited<ReturnType<typeof d.getWalkingRouteInOrder>> | null = null;

  while (true) {
    const pendingAfter = [
      ...retained.map((stop) => ({
        position: stop.position,
        lat: stop.latitude,
        lng: stop.longitude,
        visitMinutes: savedStopVisitMinutes(stop).minutes,
      })),
      ...replacements.map((r) => ({
        position: r.position,
        lat: r.stop.latitude,
        lng: r.stop.longitude,
        visitMinutes: r.stop.visitDurationMinutes,
      })),
    ].sort((a, b) => a.position - b.position);

    // Fixed-order route (NOT the optimizer, which could reorder the retained stops).
    const attempt = await d.getWalkingRouteInOrder({
      origin: hotelLocation,
      stops: pendingAfter.map(({ lat, lng }) => ({ lat, lng })),
      returnToOrigin: true,
    });
    if (!attempt.ok) {
      return { ok: false, reason: "routing_failed", message: "We couldn't calculate walking directions right now, so your plan was not changed. Please try again." };
    }

    const withinWindow =
      budgetMinutes === null ||
      fitsInBudget({
        routeSeconds: attempt.route.durationSeconds,
        visitMinutes: pendingAfter.reduce((total, stop) => total + stop.visitMinutes, 0),
        budgetMinutes,
      });

    if (withinWindow) {
      route = attempt;
      break;
    }

    if (replacements.length === 0) {
      // Even the stops the guest is keeping no longer fit the window. Changing nothing
      // is the honest outcome: the plan is untouched and removal is still offered.
      return {
        ok: false,
        reason: "no_replacement_available",
        message: "No other approved experience fits the time you have left. You can remove the unavailable stop to continue.",
        unavailableStops,
      };
    }

    replacements = replacements.slice(0, -1);
  }

  const persisted = await d.persistStopReplacement({
    dayId: day.id,
    supersedeStopIds: unavailable.map((stop) => stop.id),
    replacements,
    routeGeoJson: route.route.geometry,
    // The displayed duration follows the repaired route. The ORIGINAL estimate (used by the difficulty
    // ratchet) is stored separately and left untouched.
    totalDurationSeconds: Math.round(route.route.durationSeconds),
    now,
  });
  if (persisted.status === "conflict") {
    return { ok: false, reason: "conflict", message: "Your plan changed while we were updating it. Nothing was changed — please try again." };
  }

  return {
    ok: true,
    replaced: chosen.length,
    droppedWithoutReplacement: unavailable.length - chosen.length,
    day: persisted.day,
    stops: persisted.stops,
  };
}

export type RemoveUnavailableStopResult =
  | {
      ok: true;
      day: ItineraryDay;
      stops: ItineraryStop[];
      dayCompleted: boolean;
      /** What is LEFT of the guest's window, from generatedAt. Null when the plan never had one. */
      remainingBudgetMinutes: number | null;
    }
  | { ok: false; reason: PlanRepairFailureReason | "not_found" | "not_pending" | "stop_still_available" | "not_removable"; message: string };

export async function removeUnavailableStopForUser(
  input: { userId: string; stopId: string },
  now: Date = new Date(),
  deps?: PlanRepairDependencies
): Promise<RemoveUnavailableStopResult> {
  const d = deps ?? (await loadDefaultDependencies());

  // Ownership comes from the stop's own day; superseded stops are not found (history is never actionable).
  const found = await d.findItineraryStopWithDay(input.stopId);
  if (!found || found.day.userId !== input.userId) return { ok: false, reason: "not_found", message: "Stop not found." };
  const { stop, day } = found;

  // Completed stops are history and can never be removed.
  if (stop.visitedAt !== null) return { ok: false, reason: "not_pending", message: "Completed stops can't be removed." };

  const resolved = await resolvePlan(input.userId, now, d);
  if (!resolved.ok) return resolved;
  const plan = resolved.plan;
  if (plan.day.id !== day.id) return { ok: false, reason: "not_removable", message: "Only a stop in today's route can be removed." };

  const availability = plan.availability.get(stop.id);
  if (availability?.available) {
    return { ok: false, reason: "stop_still_available", message: "This stop is still available through your hotel, so it can't be removed." };
  }
  if (!isRepairable(availability)) {
    return { ok: false, reason: "not_removable", message: "This stop can't be removed right now." };
  }

  // Recompute the route for the remaining pending stops, in their existing order. If that fails, the stale
  // line is cleared rather than left pointing through a removed stop.
  const remaining = plan.stops.filter((s) => s.visitedAt === null && s.id !== stop.id);
  let routeGeoJson: unknown = null;
  let totalDurationSeconds: number | null = null;
  if (remaining.length > 0) {
    const route = await d.getWalkingRouteInOrder({
      origin: { lat: plan.stay.place.latitude, lng: plan.stay.place.longitude },
      stops: remaining.map((s) => ({ lat: s.latitude, lng: s.longitude })),
      returnToOrigin: true,
    });
    routeGeoJson = route.ok ? route.route.geometry : null;
    totalDurationSeconds = route.ok ? Math.round(route.route.durationSeconds) : null;
  }

  /*
   * The same budget the replace path enforces — what is LEFT of the guest's window,
   * measured from when the plan was generated — is computed here too, so both paths
   * agree on what "the budget" means.
   *
   * It does not gate the removal, and deliberately so. Removal is the guest's way
   * out of a stop they cannot complete; refusing it because their afternoon has run
   * short would strand them on exactly the plan they are trying to escape, which the
   * approved rule against trapping a guest forbids. What the budget guarantees here
   * is one-directional: removal only ever takes a stop away, so the day can only get
   * shorter, never longer. The remaining time is reported so the caller can say how
   * much is left rather than implying the original window still stands.
   */
  const remainingBudget = remainingBudgetMinutes({
    availableMinutes: day.availableMinutes,
    generatedAt: day.generatedAt,
    now,
  });

  const persisted = await d.persistStopRemoval({ dayId: day.id, stopId: stop.id, routeGeoJson, totalDurationSeconds, now });
  if (persisted.status === "conflict") {
    return { ok: false, reason: "conflict", message: "Your plan changed while we were updating it. Nothing was changed — please try again." };
  }
  return {
    ok: true,
    day: persisted.day,
    stops: persisted.stops,
    dayCompleted: persisted.day.completedAt !== null,
    remainingBudgetMinutes: remainingBudget,
  };
}
