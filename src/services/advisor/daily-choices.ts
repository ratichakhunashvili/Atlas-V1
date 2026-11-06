import type { BudgetLevel, CheckInMethod, PlaceCategory } from "@/db/schema";
import type { LatLng } from "@/lib/geo";
import type { EligiblePlace, EligibilitySource } from "@/services/eligibility/rules";
import { buildCandidates, type AdvisorCandidate } from "./candidates";
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
 * At most one option is promoted by the hotel. A partner this hotel has FEATURED gets that slot when it fits.
 * Promotion is ranking only: it never makes a Place eligible, and a promoted partner that does not fit the time
 * or interests is not offered.
 */

export const CHOICES_PER_STEP = 3;
export const MAX_DAILY_ACTIVITIES = 4;


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
  remainingMinutes: number;
  usageHistory: UsageHistory;
};

/** Every daily-plan stop is completed by the place's QR code OR the guest's location (the guest's choice). */
export const DAILY_CHECK_IN_METHOD: CheckInMethod = "qr_or_gps";

function toChoice(candidate: AdvisorCandidate, entry: EligiblePlace, origin: LatLng, hotelLocation: LatLng): DailyChoice {
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
    checkInMethod: DAILY_CHECK_IN_METHOD,
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
 * Up to three options, at most ONE of them promoted by the hotel (decision 4 of docs/catalogue-model-plan.md):
 * the featured partner first if it fits; otherwise a promoted option appears only where its bounded ranking puts
 * it. The other slots go to unpromoted candidates in ranking order. A second promoted option is offered only when
 * no unpromoted candidate is left to fill the slot — never in place of one.
 */
export function buildDailyChoices(input: BuildDailyChoicesInput): DailyChoice[] {
  const entryById = new Map(input.eligiblePlaces.map((entry) => [entry.place.id, entry]));

  const candidates = buildCandidates({
    hotelLocation: input.hotelLocation,
    hotelPlaceId: input.hotelPlaceId,
    eligiblePlaces: input.eligiblePlaces,
    selectedCategories: input.categories,
    preferredMaxDistanceMeters: input.preferredMaxDistanceMeters,
  }).filter(
    (candidate) =>
      !input.excludePlaceIds.has(candidate.place.id) && fits(candidate, input.origin, input.hotelLocation, input.remainingMinutes)
  );

  const ranked = rankCandidates(candidates, input.usageHistory, { budget: input.budget });
  const isPromoted = (candidate: AdvisorCandidate) => entryById.get(candidate.place.id)?.promotion != null;

  const chosen: AdvisorCandidate[] = [];
  const featured = ranked.find((candidate) => entryById.get(candidate.place.id)?.promotion?.featured === true);
  if (featured) chosen.push(featured);
  for (const candidate of ranked) {
    if (chosen.length >= CHOICES_PER_STEP) break;
    if (chosen.includes(candidate) || (isPromoted(candidate) && chosen.some(isPromoted))) continue;
    chosen.push(candidate);
  }
  // Only when the unpromoted pool ran out: a further promoted option rather than an empty slot.
  for (const candidate of ranked) {
    if (chosen.length >= CHOICES_PER_STEP) break;
    if (!chosen.includes(candidate)) chosen.push(candidate);
  }

  return chosen.map((candidate) => toChoice(candidate, entryById.get(candidate.place.id)!, input.origin, input.hotelLocation));
}
