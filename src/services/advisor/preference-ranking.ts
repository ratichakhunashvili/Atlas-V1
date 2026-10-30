import type { ActivityLevel, BudgetLevel } from "@/db/schema";

/**
 * How guest preferences shape a plan. Pure, no I/O.
 *
 * ORDER OF AUTHORITY: eligibility and time are hard filters that run before anything
 * here. Preferences only RANK or CAP what already passed them — a preference can never
 * make an unapproved Place appear, and never widens the 5 km candidate cap.
 */

/** A budget tier's highest acceptable `places.price_level` (1 budget, 2 moderate, 3 luxury). */
const MAX_PRICE_LEVEL: Record<BudgetLevel, number> = { budget: 1, moderate: 2, luxury: 3 };

export type PriceFit = "fits" | "unknown" | "over";

/**
 * How a Place's price tier sits against the guest's spending tier. An UNKNOWN price is
 * its own answer, ranked after known-fitting Places and never described as affordable:
 * Atlas does not know. With no spending preference there is nothing to rank on.
 */
export function priceFit(priceLevel: number | null, budget: BudgetLevel | null): PriceFit | null {
  if (budget === null) return null;
  if (priceLevel === null) return "unknown";
  return priceLevel <= MAX_PRICE_LEVEL[budget] ? "fits" : "over";
}

const PRICE_FIT_ORDER: Record<PriceFit, number> = { fits: 0, unknown: 1, over: 2 };

/** Sort key for price fit; 0 for everyone when there is no spending preference, so it never reorders. */
export function priceFitRank(priceLevel: number | null, budget: BudgetLevel | null): number {
  const fit = priceFit(priceLevel, budget);
  return fit === null ? 0 : PRICE_FIT_ORDER[fit];
}

/** The most stops a pace is happy with in one plan. Null (no preference) imposes no cap of its own. */
const PACE_STOP_CAP: Record<ActivityLevel, number> = { low: 3, moderate: 5, high: 8 };

export function paceStopCap(activityLevel: ActivityLevel | null): number | null {
  return activityLevel === null ? null : PACE_STOP_CAP[activityLevel];
}

/** The difficulty ratchet's target, trimmed (never raised) by the guest's pace. */
export function applyPaceToStopCount(targetStopCount: number, activityLevel: ActivityLevel | null): number {
  const cap = paceStopCap(activityLevel);
  return cap === null ? targetStopCount : Math.min(targetStopCount, cap);
}

/** A guest's distance preference can only NARROW the Advisor's own candidate cap, never widen it. */
export function effectiveMaxDistanceMeters(preferredMeters: number | null, capMeters: number): number {
  if (preferredMeters === null || !Number.isFinite(preferredMeters) || preferredMeters <= 0) return capMeters;
  return Math.min(preferredMeters, capMeters);
}

export type RankingPreferences = {
  budget: BudgetLevel | null;
};

const PRICE_LABELS: Record<number, string> = { 1: "Budget", 2: "Moderate", 3: "Luxury" };

/** What a guest is told about a price tier. Null (unknown) yields null: nothing is said, and certainly not "affordable". */
export function describePriceLevel(priceLevel: number | null | undefined): string | null {
  return priceLevel == null ? null : (PRICE_LABELS[priceLevel] ?? null);
}
