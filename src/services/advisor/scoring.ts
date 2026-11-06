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
 * Only used to break a tie between two promoted candidates whose bounded keys
 * are equal (see rankCandidates). A candidate with an explicit priority wins
 * such a tie over one without — a
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
 * How many places a hotel's promotion with an explicit priority may lift an Atlas partner above where its fit
 * alone would rank it (docs/catalogue-model-plan.md §4, decision 4). Promotion without a priority lifts nothing:
 * it only labels the Place and, when featured, earns the one promoted slot in a 1-of-3 choice.
 *
 * The cap is what keeps promotion from becoming advertising: a promoted Place can never pass a candidate that
 * fits more than PROMOTION_MAX_LIFT places better.
 */
export const PROMOTION_MAX_LIFT = 2;

function promotionLift(candidate: AdvisorCandidate): number {
  return candidate.isPartner && candidate.partnerPriority !== null ? PROMOTION_MAX_LIFT : 0;
}

/**
 * The fit order: the Map Advisor Functional rule with Atlas's spending tier.
 *
 * 1. Spending tier: a Place that fits the guest's tier ranks ahead of one with an unknown price, which ranks
 *    ahead of one known to cost more.
 * 2. Freshness: never-used first, then least-recently-used.
 * 3. Distance: closer wins.
 * 4. Two promoted partners that tie exactly: the hotel's priority.
 */
function compareFit(a: AdvisorCandidate, b: AdvisorCandidate, usageHistory: UsageHistory, preferences?: RankingPreferences): number {
  if (preferences) {
    const priceOrder = priceFitRank(a.place.priceLevel, preferences.budget) - priceFitRank(b.place.priceLevel, preferences.budget);
    if (priceOrder !== 0) return priceOrder;
  }
  const freshnessOrder = freshnessScore(a, usageHistory) - freshnessScore(b, usageHistory);
  if (freshnessOrder !== 0) return freshnessOrder;
  const distanceOrder = a.distanceMeters - b.distanceMeters;
  if (distanceOrder !== 0) return distanceOrder;
  // An exact fit tie: the hotel's explicit priority decides (no priority sorts last, so the order stays total).
  return comparePartnerPriority(tiePriority(a), tiePriority(b));
}

function tiePriority(candidate: AdvisorCandidate): number | null {
  return candidate.isPartner ? candidate.partnerPriority : null;
}

/**
 * Ranks the candidates by fit, then applies the BOUNDED hotel promotion:
 *
 * - Each candidate's key is its fit position minus its promotion lift (0, or PROMOTION_MAX_LIFT when its
 *   hotel promotion has a priority). Lower keys rank first.
 * - Equal keys: the promoted candidate first, then the lower explicit priority (comparePartnerPriority), then fit.
 *
 * Every key is fixed before sorting, so the order is a plain lexicographic sort: deterministic and transitive.
 * Promotion never makes a Place eligible (eligibility already decided who is here).
 *
 * Used for both the full mixed pool and a promoted-only subset (filter, then call this), so "the best promoted
 * partner" is `rankCandidates(candidates.filter(c => c.isPartner), usage)[0]` without a second ranking function.
 */
export function rankCandidates(
  candidates: readonly AdvisorCandidate[],
  usageHistory: UsageHistory,
  preferences?: RankingPreferences
): AdvisorCandidate[] {
  const byFit = [...candidates].sort((a, b) => compareFit(a, b, usageHistory, preferences));
  const keyed = byFit.map((candidate, fitIndex) => ({ candidate, fitIndex, key: fitIndex - promotionLift(candidate) }));
  keyed.sort((a, b) => {
    if (a.key !== b.key) return a.key - b.key;
    if (a.candidate.isPartner !== b.candidate.isPartner) return a.candidate.isPartner ? -1 : 1;
    if (a.candidate.isPartner) {
      const priorityOrder = comparePartnerPriority(a.candidate.partnerPriority, b.candidate.partnerPriority);
      if (priorityOrder !== 0) return priorityOrder;
    }
    return a.fitIndex - b.fitIndex;
  });
  return keyed.map((entry) => entry.candidate);
}
