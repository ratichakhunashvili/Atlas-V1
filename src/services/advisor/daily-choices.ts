import { MAX_DAILY_TASK_LIMIT, PLACE_CATEGORIES, type BudgetLevel, type CheckInMethod, type PlaceCategory } from "@/db/schema";
import type { LatLng } from "@/lib/geo";
import type { EligiblePlace, EligibilitySource } from "@/services/eligibility/rules";
import { buildCandidates, type AdvisorCandidate } from "./candidates";
import { categoryGroupOf, type CategoryGroup } from "./category-groups";
import { rankCandidates, type UsageHistory } from "./scoring";
import { estimateWalkMinutes } from "./time-budget";
import { resolveVisitDuration } from "./visit-duration";

/*
 * "Choose 1 of 3": the next options a guest is offered during their day. Pure — no DB, no clock.
 *
 * The pool is ONLY the hotel's eligible Places (services/eligibility), narrowed by the guest's interests, price
 * and distance. An option is offered only if the guest can walk there from where they are, spend its visit time,
 * and walk back to the hotel inside the time they have left. Fewer than three fit -> fewer are offered; nothing
 * is ever added from outside the eligible pool.
 *
 * Variety (category-groups.ts): the options are from different category groups, and never from a group the day
 * already has: no second food place once a restaurant is picked.
 *
 * At most one option is promoted by the hotel. A partner this hotel has FEATURED gets that slot when it fits.
 * Promotion is ranking only: it never makes a Place eligible, and a promoted partner that does not fit the time
 * or interests is not offered.
 */

export const CHOICES_PER_STEP = 3;
/** The most activities a day can ever have. Each hotel sets its own limit, 1 to this (hotels.daily_task_limit, 0040). */
export const MAX_DAILY_ACTIVITIES = MAX_DAILY_TASK_LIMIT;

/**
 * Plan order (owner decision 2026-11-15): which kind of place a step of the day prefers.
 *   - "campus": the 1st task: the guest's own hotel's facilities (eligibility source "facility").
 *   - "food":   the 2nd task: food places, the "food" category group (restaurant and nightlife).
 *   - null:     the 3rd task on: any eligible place, as before.
 * The preferred group IGNORES the guest's interest filters, so a guest who did not tick "restaurant" still gets lunch
 * and the campus is offered to everyone. Distance, time fit, no repeat place and one place per category group still
 * apply. When nothing in the preferred group fits, the step offers the normal best options (interest-filtered) instead
 * of nothing. Both pools are drawn from the eligible catalogue only, so ordering can never add an ineligible place.
 */
export type DailyStepFocus = "campus" | "food";

export function stepFocusFor(picksUsed: number): DailyStepFocus | null {
  if (picksUsed === 0) return "campus";
  if (picksUsed === 1) return "food";
  return null;
}

function matchesFocus(entry: EligiblePlace, focus: DailyStepFocus): boolean {
  return focus === "campus" ? entry.source === "facility" : categoryGroupOf(entry.place.category) === "food";
}


export type DailyChoice = {
  placeId: string;
  name: string;
  category: PlaceCategory;
  source: EligibilitySource;
  featured: boolean;
  offerText: string | null;
  priceLevel: number | null;
  address: string | null;
  imageUrl: string | null;
  latitude: number;
  longitude: number;
  checkInMethod: CheckInMethod;
  /** Estimated walk from where the guest is now. */
  walkMinutes: number;
  visitMinutes: number;
  /** Estimated walk from the place back to the hotel. */
  returnWalkMinutes: number;
};

export type BuildDailyChoicesInput = {
  eligiblePlaces: readonly EligiblePlace[];
  hotelPlaceId: string;
  hotelLocation: LatLng;
  /** Where the guest starts this step: the hotel, or the last place they checked in to. */
  origin: LatLng;
  categories: readonly PlaceCategory[];
  budget: BudgetLevel | null;
  preferredMaxDistanceMeters: number | null;
  /** Places already part of today (picked or visited): never offered twice in a day. */
  excludePlaceIds: ReadonlySet<string>;
  /** Category groups today already has: one place per group per day. */
  usedCategoryGroups?: ReadonlySet<CategoryGroup>;
  remainingMinutes: number;
  usageHistory: UsageHistory;
  /** Which group this step prefers (stepFocusFor); none = any eligible place. */
  focus?: DailyStepFocus | null;
};

/**
 * A daily-plan stop is completed the way an admin chose for its Place: QR only, location only, or either ("qr_or_gps",
 * the default). The stop keeps its own copy, so a later admin change never alters a stop already planned.
 */
function toChoice(candidate: Pick<AdvisorCandidate, "place">, entry: EligiblePlace, origin: LatLng, hotelLocation: LatLng): DailyChoice {
  const { place } = candidate;
  const at = { lat: place.latitude, lng: place.longitude };
  return {
    placeId: place.id,
    name: place.name,
    category: place.category,
    source: entry.source,
    featured: entry.promotion?.featured ?? false,
    offerText: entry.promotion?.offerText ?? null,
    priceLevel: place.priceLevel,
    address: place.address,
    imageUrl: place.imageUrl,
    latitude: place.latitude,
    longitude: place.longitude,
    checkInMethod: place.checkInMethod,
    walkMinutes: Math.round(estimateWalkMinutes(origin, at)),
    visitMinutes: resolveVisitDuration(place).minutes,
    returnWalkMinutes: Math.round(estimateWalkMinutes(at, hotelLocation)),
  };
}

/** Whether one more stop fits: there, the visit, and back to the hotel — with unrounded estimates. */
function fits(candidate: AdvisorCandidate, origin: LatLng, hotelLocation: LatLng, remainingMinutes: number): boolean {
  const at = { lat: candidate.place.latitude, lng: candidate.place.longitude };
  const needed = estimateWalkMinutes(origin, at) + resolveVisitDuration(candidate.place).minutes + estimateWalkMinutes(at, hotelLocation);
  return needed <= remainingMinutes;
}

/**
 * A hotel's "Day program" step (owner decision 2026-11-15, hotel_day_program_steps): the admin chose these 1-3 places
 * for this step of the day, and the guest picks one of them (a 1-place step is mandatory: just that one).
 *
 * Decisions:
 *   - Only ELIGIBLE places: every id goes through the guest's eligible catalogue. A place the program lists that is not
 *     eligible right now (archived, unpublished, contract lapsed, another hotel's facility...) is silently skipped. The
 *     program orders what is offered; it never widens the catalogue.
 *   - The owner's choice overrides the guest's interest filters, the distance cap and the one-place-per-category-group
 *     rule (a program step may list two restaurants).
 *   - The time fit is NOT applied: the places are shown even when the estimate is tight. Each option still carries its
 *     walk there and its walk back to the hotel (returnWalkMinutes), so the return-to-hotel timing stays visible.
 *   - No repeats: a place already part of today is not offered again.
 *   - Offered in the order the admin listed them. An empty result means the caller falls back to the normal step.
 */
export function buildProgramChoices(input: {
  programPlaceIds: readonly string[];
  eligiblePlaces: readonly EligiblePlace[];
  hotelPlaceId: string;
  hotelLocation: LatLng;
  origin: LatLng;
  excludePlaceIds: ReadonlySet<string>;
}): DailyChoice[] {
  const entryById = new Map(input.eligiblePlaces.map((entry) => [entry.place.id, entry]));
  const choices: DailyChoice[] = [];
  for (const placeId of new Set(input.programPlaceIds)) {
    const entry = entryById.get(placeId);
    if (!entry || placeId === input.hotelPlaceId || input.excludePlaceIds.has(placeId)) continue;
    choices.push(toChoice(entry, entry, input.origin, input.hotelLocation));
  }
  return choices;
}

/**
 * Up to three options, at most ONE of them promoted by the hotel (decision 4 of docs/catalogue-model-plan.md):
 * the featured partner first if it fits; otherwise a promoted option appears only where its bounded ranking puts
 * it. The other slots go to unpromoted candidates in ranking order. A second promoted option is offered only when
 * no unpromoted candidate is left to fill the slot — never in place of one.
 */
export function buildDailyChoices(input: BuildDailyChoicesInput): DailyChoice[] {
  if (input.focus) {
    // The preferred group, interests ignored (see DailyStepFocus). Still only eligible places.
    const preferred = chooseFrom(input, input.eligiblePlaces.filter((entry) => matchesFocus(entry, input.focus!)), PLACE_CATEGORIES);
    if (preferred.length > 0) return preferred;
  }
  return chooseFrom(input, input.eligiblePlaces, input.categories);
}

function chooseFrom(input: BuildDailyChoicesInput, pool: readonly EligiblePlace[], categories: readonly PlaceCategory[]): DailyChoice[] {
  const entryById = new Map(pool.map((entry) => [entry.place.id, entry]));

  const candidates = buildCandidates({
    hotelLocation: input.hotelLocation,
    hotelPlaceId: input.hotelPlaceId,
    eligiblePlaces: pool,
    selectedCategories: categories,
    preferredMaxDistanceMeters: input.preferredMaxDistanceMeters,
  }).filter(
    (candidate) =>
      !input.excludePlaceIds.has(candidate.place.id) &&
      !input.usedCategoryGroups?.has(categoryGroupOf(candidate.place.category)) &&
      fits(candidate, input.origin, input.hotelLocation, input.remainingMinutes)
  );

  const ranked = rankCandidates(candidates, input.usageHistory, { budget: input.budget });
  const isPromoted = (candidate: AdvisorCandidate) => entryById.get(candidate.place.id)?.promotion != null;

  const chosen: AdvisorCandidate[] = [];
  const groupTaken = (candidate: AdvisorCandidate) =>
    chosen.some((other) => categoryGroupOf(other.place.category) === categoryGroupOf(candidate.place.category));
  const featured = ranked.find((candidate) => entryById.get(candidate.place.id)?.promotion?.featured === true);
  if (featured) chosen.push(featured);
  for (const candidate of ranked) {
    if (chosen.length >= CHOICES_PER_STEP) break;
    if (chosen.includes(candidate) || groupTaken(candidate) || (isPromoted(candidate) && chosen.some(isPromoted))) continue;
    chosen.push(candidate);
  }
  // Only when the unpromoted pool ran out: a further promoted option rather than an empty slot.
  for (const candidate of ranked) {
    if (chosen.length >= CHOICES_PER_STEP) break;
    if (!chosen.includes(candidate) && !groupTaken(candidate)) chosen.push(candidate);
  }

  return chosen.map((candidate) => toChoice(candidate, entryById.get(candidate.place.id)!, input.origin, input.hotelLocation));
}
