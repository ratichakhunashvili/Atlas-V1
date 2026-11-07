import type { PlaceCategory } from "@/db/schema";

/*
 * Variety in a guest's day: at most ONE place from each category group per day. Two food places, or a church and
 * then a museum, would be the same kind of outing twice. Pure: the daily "choose 1 of 3", full-plan generation
 * and plan repair all apply it through these helpers.
 *
 * The rule only removes options. When there aren't enough different groups to fill a day, the plan has fewer
 * stops; it never repeats a group and never adds anything from outside the eligible pool.
 */

export const CATEGORY_GROUPS = ["food", "wine", "history", "nature", "wellness", "activities", "shopping", "lodging", "other"] as const;
export type CategoryGroup = (typeof CATEGORY_GROUPS)[number];

const GROUP_OF: Record<PlaceCategory, CategoryGroup> = {
  restaurant: "food",
  nightlife: "food",
  winery: "wine",
  historical: "history",
  landmark: "history",
  museum: "history",
  nature: "nature",
  beach: "nature",
  spa: "wellness",
  tour: "activities",
  activity: "activities",
  attraction: "activities",
  shop: "shopping",
  hotel: "lodging",
  other: "other",
};

export function categoryGroupOf(category: PlaceCategory): CategoryGroup {
  return GROUP_OF[category];
}

/** The groups a day already has, from its stops' saved categories. A stop without a category counts for nothing. */
export function groupsUsedBy(stops: readonly { category: PlaceCategory | null }[]): Set<CategoryGroup> {
  const used = new Set<CategoryGroup>();
  for (const stop of stops) if (stop.category) used.add(categoryGroupOf(stop.category));
  return used;
}

/**
 * Keeps ranked items in order, taking at most one per group and none from `used`, up to `limit`.
 * The first item of each group wins, so ranking decides WHICH food place; this decides that there is only one.
 */
export function onePerGroup<T>(
  ranked: readonly T[],
  categoryOf: (item: T) => PlaceCategory | null,
  options: { used?: ReadonlySet<CategoryGroup>; limit?: number } = {}
): T[] {
  const taken = new Set(options.used ?? []);
  const kept: T[] = [];
  for (const item of ranked) {
    if (options.limit !== undefined && kept.length >= options.limit) break;
    const category = categoryOf(item);
    if (category) {
      const group = categoryGroupOf(category);
      if (taken.has(group)) continue;
      taken.add(group);
    }
    kept.push(item);
  }
  return kept;
}
