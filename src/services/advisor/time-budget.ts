import { distanceMeters, type LatLng } from "@/lib/geo";

/**
 * Does a day fit in the time the guest said they had?
 *
 * Two different numbers are involved, and keeping them apart matters:
 *
 *  - The ESTIMATE here, used to choose stops before any route exists. It is
 *    straight-line distance scaled by a detour factor, because streets are not
 *    straight, at a steady walking pace.
 *  - The REAL walking time from Mapbox, which the caller checks afterwards with
 *    `fitsInBudget`. The plan is only ever persisted against the real number
 *    (generate-itinerary.ts); the estimate exists to avoid asking Mapbox about
 *    days that obviously cannot fit.
 *
 * Everything is pure, so the rules can be tested without a Mapbox account.
 */

/** A relaxed walking pace in metres per second — about 4.3 km/h, not a brisk commute. */
export const WALKING_SPEED_METERS_PER_SECOND = 1.2;

/**
 * Street networks are longer than the line between two points. 1.3 is the usual
 * rule-of-thumb multiplier for a dense city grid and is deliberately on the
 * cautious side: over-estimating the walk costs a stop, under-estimating makes
 * the guest late back.
 */
export const WALKING_DETOUR_FACTOR = 1.3;

/** The windows a guest can choose from. The server accepts nothing else. */
export const AVAILABLE_MINUTE_OPTIONS = [60, 120, 180, 240] as const;
export type AvailableMinutes = (typeof AVAILABLE_MINUTE_OPTIONS)[number];

export function isAvailableMinutesOption(value: unknown): value is AvailableMinutes {
  return typeof value === "number" && (AVAILABLE_MINUTE_OPTIONS as readonly number[]).includes(value);
}

/** Estimated walking minutes between two points, including the detour allowance. */
export function estimateWalkMinutes(from: LatLng, to: LatLng): number {
  const metres = distanceMeters(from, to) * WALKING_DETOUR_FACTOR;
  return metres / WALKING_SPEED_METERS_PER_SECOND / 60;
}

/**
 * Estimated minutes for the whole round trip: hotel -> each stop in order ->
 * hotel, plus the time spent at every stop.
 *
 * The return leg is always counted. A plan that gets the guest to the far side of
 * town with no time to walk back has not fitted their free time, whatever the
 * outward legs add up to.
 */
export function estimateRoundTripMinutes(input: {
  hotelLocation: LatLng;
  stops: readonly { location: LatLng; visitMinutes: number }[];
}): number {
  const { hotelLocation, stops } = input;
  if (stops.length === 0) return 0;

  let total = 0;
  let from = hotelLocation;

  for (const stop of stops) {
    total += estimateWalkMinutes(from, stop.location);
    total += stop.visitMinutes;
    from = stop.location;
  }

  // The walk home.
  total += estimateWalkMinutes(from, hotelLocation);

  return total;
}

/**
 * Takes stops from the front of an already-ranked list while the estimated round
 * trip still fits the guest's window.
 *
 * Order is preserved and nothing is reordered or swapped in: a candidate that
 * does not fit is skipped, and a later, closer one may still be taken. That keeps
 * the ranking's meaning — best first — while filling the time that is left.
 */
export function fitStopsToBudget<T extends { location: LatLng; visitMinutes: number }>(input: {
  hotelLocation: LatLng;
  candidates: readonly T[];
  budgetMinutes: number;
  maxStops: number;
}): T[] {
  const chosen: T[] = [];

  for (const candidate of input.candidates) {
    if (chosen.length >= input.maxStops) break;

    const withCandidate = [...chosen, candidate];
    const estimate = estimateRoundTripMinutes({
      hotelLocation: input.hotelLocation,
      stops: withCandidate,
    });

    if (estimate <= input.budgetMinutes) {
      chosen.push(candidate);
    }
  }

  return chosen;
}

/**
 * The check that actually decides whether a plan is honest, applied to the REAL
 * route duration once Mapbox has returned one.
 */
export function fitsInBudget(input: {
  routeSeconds: number;
  visitMinutes: number;
  budgetMinutes: number;
}): boolean {
  return input.routeSeconds / 60 + input.visitMinutes <= input.budgetMinutes;
}

/** Total minutes a guest should expect a routed plan to take: the real walk plus every visit. */
export function totalPlanMinutes(input: { routeSeconds: number; visitMinutes: number }): number {
  return input.routeSeconds / 60 + input.visitMinutes;
}

export type PlanTimeSummary = {
  /** What the plan still asks of the guest: the active route's walking time plus every PENDING visit. */
  plannedMinutes: number;
  /** What is left of their window. Null when the plan never recorded one. */
  remainingMinutes: number | null;
  /** Whether the plan fits that remaining time. Null when there is no window to judge it against. */
  fitsRemaining: boolean | null;
  /** How far over, when it does not fit. Null otherwise, so "0" always means "exactly fits". */
  overBudgetByMinutes: number | null;
};

/**
 * The two numbers a guest needs, kept apart on purpose.
 *
 * "You have 40 minutes left" and "this plan needs 70" are different facts, and
 * collapsing them into one reassuring figure is how an interface ends up implying a
 * day fits when it does not. This returns both, plus an explicit verdict, so the UI
 * can show the time remaining AND say plainly when the plan no longer fits it.
 *
 * Nothing here changes a plan. Over-budget is a thing to report, not a thing to
 * silently fix by dropping the guest's stops.
 *
 * `routeSeconds` is the ACTIVE route's walking time — the whole loop, including legs
 * the guest has already walked, because Atlas does not re-route as they go. It is
 * therefore an upper bound on what is left, and is labelled as such rather than
 * presented as precise.
 */
export function summarisePlanTime(input: {
  routeSeconds: number | null;
  pendingVisitMinutes: number;
  remainingMinutes: number | null;
}): PlanTimeSummary {
  const plannedMinutes = Math.round((input.routeSeconds ?? 0) / 60 + input.pendingVisitMinutes);

  if (input.remainingMinutes === null) {
    return { plannedMinutes, remainingMinutes: null, fitsRemaining: null, overBudgetByMinutes: null };
  }

  const remainingMinutes = Math.round(input.remainingMinutes);
  const fitsRemaining = plannedMinutes <= remainingMinutes;

  return {
    plannedMinutes,
    remainingMinutes,
    fitsRemaining,
    overBudgetByMinutes: fitsRemaining ? null : plannedMinutes - remainingMinutes,
  };
}

/**
 * How much of the guest's window is actually LEFT.
 *
 * The window starts when the plan was generated: a guest who asked for two hours
 * and set off ninety minutes ago has thirty minutes, not two hours. Holding a
 * repair to the original figure would quietly hand them a day that no longer fits
 * the afternoon they have — the exact failure the budget exists to prevent.
 *
 * Returns null for a plan with no recorded window (generated before guests could
 * choose one). Null means "there is no budget to enforce", never "zero".
 *
 * Clamped at zero: a window that has already run out leaves nothing to spend, and
 * a negative budget would let arithmetic elsewhere read as "plenty of room".
 *
 * `availableMinutes` on the day is the ORIGINAL window and is never rewritten —
 * it is what the guest asked for, and a repair does not get to revise history.
 */
export function remainingBudgetMinutes(input: {
  availableMinutes: number | null;
  generatedAt: Date;
  now: Date;
}): number | null {
  if (input.availableMinutes === null) return null;

  const elapsedMinutes = (input.now.getTime() - input.generatedAt.getTime()) / 60_000;
  // A clock skew that puts "now" before generation must not inflate the budget.
  const spent = Math.max(0, elapsedMinutes);

  return Math.max(0, input.availableMinutes - spent);
}
