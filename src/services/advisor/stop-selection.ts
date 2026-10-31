import { PLACE_CATEGORIES, type PlaceCategory, type UserPreferences } from "@/db/schema";
import type { AdvisorCandidate } from "./candidates";
import type { RankingPreferences } from "./preference-ranking";
import { rankCandidates, type UsageHistory } from "./scoring";

/**
 * Stop-selection rules shared by itinerary generation AND explicit plan repair, so there is one
 * implementation of "which candidates become stops". Pure: no I/O.
 */

export function toPlaceCategories(categories: readonly string[]): PlaceCategory[] {
  const valid = new Set<string>(PLACE_CATEGORIES);
  return categories.filter((category): category is PlaceCategory => valid.has(category));
}

/**
 * Admins testing without preferences get every category; everyone else must have picked at least one
 * interest. Returns null when the guest has no usable preferences.
 */
export function resolveCandidateCategories(isAdmin: boolean, preferences: Pick<UserPreferences, "categories"> | null): PlaceCategory[] | null {
  const selected = toPlaceCategories(preferences?.categories ?? []);
  if (selected.length > 0) return selected;
  return isAdmin ? [...PLACE_CATEGORIES] : null;
}

/**
 * Picks up to `targetCount` stops from the ELIGIBLE candidates: the best active partner leads (when one
 * is available), the rest come from the ranked pool. Places in `excludePlaceIds` (already in today's plan)
 * are never chosen again. A pool smaller than the target yields FEWER stops — never a repeat, an unapproved
 * place, or a synthetic activity.
 */
export function chooseStops(input: {
  candidates: readonly AdvisorCandidate[];
  usageHistory: UsageHistory;
  targetCount: number;
  excludePlaceIds?: ReadonlySet<string>;
  preferences?: RankingPreferences;
}): AdvisorCandidate[] {
  const exclude = input.excludePlaceIds ?? new Set<string>();
  const pool = input.candidates.filter((candidate) => !exclude.has(candidate.place.id));

  const rankedAll = rankCandidates(pool, input.usageHistory, input.preferences);
  const rankedPartners = rankCandidates(
    pool.filter((candidate) => candidate.isPartner),
    input.usageHistory,
    input.preferences
  );

  const chosen: AdvisorCandidate[] = [];
  const chosenPlaceIds = new Set<string>();

  if (input.targetCount > 0 && rankedPartners.length > 0) {
    const bestPartner = rankedPartners[0];
    chosen.push(bestPartner);
    chosenPlaceIds.add(bestPartner.place.id);
  }

  for (const candidate of rankedAll) {
    if (chosen.length >= input.targetCount) break;
    if (chosenPlaceIds.has(candidate.place.id)) continue;
    chosen.push(candidate);
    chosenPlaceIds.add(candidate.place.id);
  }

  return chosen;
}
