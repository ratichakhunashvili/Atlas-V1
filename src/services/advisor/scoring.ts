import type { AdvisorCandidate } from "./candidates";
import { priceFitRank, type RankingPreferences } from "./preference-ranking";

/** A candidate never used in a previous itinerary ranks ahead of any used one — matches Map Advisor Functional's `usage.get(sourceId) ?? -1`. */
const NEVER_USED = -1;

/**
 * Place id -> the most recent itinerary dayNumber it appeared in, for this
 * guest at this hotel. Built elsewhere (the later Advisor query layer) from
 * itinerary_stops/itinerary_days — scoring.ts only ever reads it.
 */
export type UsageHistory = ReadonlyMap<string, number>;

function freshnessScore(candidate: AdvisorCandidate, usageHistory: UsageHistory): number {
  return usageHistory.get(candidate.place.id) ?? NEVER_USED;
}

/**
 * Priority ordering for two PARTNER candidates. Lower numeric priority wins
 * (priority 1 outranks priority 2) — the plain, undocumented-elsewhere
 * convention chosen here since nothing in Atlas's existing schema implies
 * otherwise; hotel_places.priority's own comment only says "a hotel only
 * needs to set this to prioritize a partner," not which direction.
 *
 * A candidate with an explicit priority always outranks one without — a
 * null priority means "no opinion," not "priority zero." Comparing two null
 * priorities returns 0 (no distinction), which is what lets the caller fall
 * through to freshness/distance for the common case where no hotel has set
 * priorities at all: the ranking must come out byte-for-byte identical to
 * the original algorithm in that case, never reordered just because the
 * field exists. (A naive `(a.priority ?? X) - (b.priority ?? X)` for any
 * fixed X would either collide two nulls into a fake tie at the wrong spot
 * or, with X = Infinity, divide by two Infinities into NaN — both bugs this
 * three-way branch avoids.)
 */
function comparePartnerPriority(a: number | null, b: number | null): number {
  if (a !== null && b !== null) return a - b;
  if (a !== null) return -1;
  if (b !== null) return 1;
  return 0;
}

/**
 * The exact Map Advisor Functional ranking rule, extended with Atlas's new
 * partner-priority capability:
 *
 * 1. Partner-vs-partner only: explicit priority first (lower wins; a
 *    candidate with a priority always beats one without).
 * 2. Freshness: never-used first, then least-recently-used.
 * 3. Distance: closer wins — reusing each candidate's already-computed
 *    `distanceMeters` (from candidates.ts's 5km filter) rather than
 *    recomputing Haversine distance again here.
 *
 * Used for both the full mixed pool and a partner-only subset (filter, then
 * call this) — the later itinerary service identifies "the best partner" as
 * `rankCandidates(candidates.filter(c => c.isPartner), usage)[0]` without
 * needing a second, separate ranking function.
 */
export function rankCandidates(
  candidates: readonly AdvisorCandidate[],
  usageHistory: UsageHistory,
  preferences?: RankingPreferences
): AdvisorCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.isPartner && b.isPartner) {
      const priorityOrder = comparePartnerPriority(a.partnerPriority, b.partnerPriority);
      if (priorityOrder !== 0) return priorityOrder;
    }

    // Spending tier: a Place that fits the guest's tier ranks ahead of one with an unknown price, which
    // ranks ahead of one known to cost more. Only a RANKING step — eligibility already decided who is here.
    if (preferences) {
      const priceOrder =
        priceFitRank(a.place.priceLevel, preferences.budget) - priceFitRank(b.place.priceLevel, preferences.budget);
      if (priceOrder !== 0) return priceOrder;
    }

    const freshnessOrder = freshnessScore(a, usageHistory) - freshnessScore(b, usageHistory);
    if (freshnessOrder !== 0) return freshnessOrder;

    return a.distanceMeters - b.distanceMeters;
  });
}
