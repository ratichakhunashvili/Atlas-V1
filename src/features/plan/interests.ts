import { BUDGET_LEVELS, type BudgetLevel, type PlaceCategory } from "@/db/schema";

/*
 * The guest-facing choices on "Plan my time" and how they map onto Atlas's stored preferences.
 *
 * Pure and shared: the form uses it to show what is saved, the server action uses it to turn a posted form into
 * categories. Interests only NARROW the hotel's eligible Places — nothing here can make a Place eligible.
 */

export const INTERESTS = ["Food", "Culture", "Nature", "Wellness", "History", "Art", "Nightlife", "Shopping"] as const;
export type Interest = (typeof INTERESTS)[number];

export const INTEREST_CATEGORIES: Readonly<Record<Interest, readonly PlaceCategory[]>> = {
  Food: ["restaurant"],
  Culture: ["tour", "attraction", "activity"],
  Nature: ["nature", "beach"],
  Wellness: ["spa"],
  History: ["historical", "landmark"],
  Art: ["museum"],
  Nightlife: ["nightlife"],
  Shopping: ["shop"],
};

/** Categories no interest reaches on purpose: the hotel itself, and the catch-all. */
export const CATEGORIES_WITHOUT_INTEREST: readonly PlaceCategory[] = ["hotel", "other"];

export function isInterest(value: unknown): value is Interest {
  return typeof value === "string" && (INTERESTS as readonly string[]).includes(value);
}

/** The stored categories for a set of interests, de-duplicated, in a stable order. */
export function categoriesForInterests(interests: readonly Interest[]): PlaceCategory[] {
  const seen = new Set<PlaceCategory>();
  for (const interest of INTERESTS) {
    if (!interests.includes(interest)) continue;
    for (const category of INTEREST_CATEGORIES[interest]) seen.add(category);
  }
  return [...seen];
}

/** Which interests to show as picked for saved categories: an interest is picked if any of its categories is saved. */
export function interestsForCategories(categories: readonly string[]): Interest[] {
  return INTERESTS.filter((interest) => INTEREST_CATEGORIES[interest].some((category) => categories.includes(category)));
}

/** Free-time choices, in minutes. "4 h+" plans for four hours: Atlas never plans past what it can check. */
export const TIME_CHOICES = [
  { label: "1 h", minutes: 60 },
  { label: "2 h", minutes: 120 },
  { label: "3 h", minutes: 180 },
  { label: "4 h+", minutes: 240 },
] as const;
export type TimeLabel = (typeof TIME_CHOICES)[number]["label"];

export const PRICE_CHOICES = [
  { label: "Any", budget: null },
  { label: "Budget", budget: "budget" },
  { label: "Moderate", budget: "moderate" },
  { label: "Luxury", budget: "luxury" },
] as const satisfies readonly { label: string; budget: BudgetLevel | null }[];
export type PriceLabel = (typeof PRICE_CHOICES)[number]["label"];

export function priceLabelFor(budget: string | null): PriceLabel {
  return PRICE_CHOICES.find((choice) => choice.budget === budget)?.label ?? "Any";
}

export function budgetForPriceLabel(label: unknown): BudgetLevel | null | undefined {
  const choice = PRICE_CHOICES.find((option) => option.label === label);
  if (!choice) return undefined;
  return choice.budget && (BUDGET_LEVELS as readonly string[]).includes(choice.budget) ? choice.budget : null;
}

export function minutesForTimeLabel(label: unknown): number | undefined {
  return TIME_CHOICES.find((choice) => choice.label === label)?.minutes;
}
