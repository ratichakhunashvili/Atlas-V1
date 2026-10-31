import { distanceMeters, type LatLng } from "@/lib/geo";
import { effectiveMaxDistanceMeters } from "./preference-ranking";
import type { Place, PlaceCategory } from "@/db/schema";
import type { EligiblePlace } from "@/services/eligibility/rules";

/** Keeps a day's round trip to a realistic walking distance — matches Map Advisor Functional's original MAX_CANDIDATE_DISTANCE_METERS exactly. */
export const MAX_CANDIDATE_DISTANCE_METERS = 5000;

export type AdvisorCandidate = {
  place: Place;
  distanceMeters: number;
  /** True only for an external Place with an active, confirmed partnership with this hotel. A hotel-owned facility is eligible but is not a "partner". */
  isPartner: boolean;
  partnerPriority: number | null;
};

export type BuildCandidatesInput = {
  /** The hotel's own location — the round-trip origin, not a candidate itself. */
  hotelLocation: LatLng;
  /** The hotel's own Place id, excluded from the pool: visiting the hotel itself isn't a candidate stop. The hotel is only ever the route's origin and return point. */
  hotelPlaceId: string;
  /**
   * The hotel's ELIGIBLE Places only (services/eligibility): its own active
   * facilities plus external Places with an active, confirmed partnership
   * with this hotel. This module never sees, and so can never recommend, any
   * other Place — it only applies the distance and preference filters on top.
   */
  eligiblePlaces: readonly EligiblePlace[];
  /** The user's selected categories (user_preferences.categories). Empty means no eligible candidates — never a silently-invented fallback. */
  selectedCategories: readonly PlaceCategory[];
  /**
   * The guest's own distance preference. It can only narrow the 5,000 m cap: a value above it
   * (or none) leaves the cap as is.
   */
  preferredMaxDistanceMeters?: number | null;
};

/**
 * Pure candidate-pool construction: eligible Places (see above) within
 * 5000m of the hotel AND with a category in the user's selected categories —
 * Map Advisor Functional's original distance + preference rule, applied only
 * to hotel-eligible Places. No DB access, no randomness, no itinerary
 * assembly — just the candidate pool.
 */
export function buildCandidates(input: BuildCandidatesInput): AdvisorCandidate[] {
  const { hotelLocation, hotelPlaceId, eligiblePlaces, selectedCategories } = input;
  const maxDistance = effectiveMaxDistanceMeters(input.preferredMaxDistanceMeters ?? null, MAX_CANDIDATE_DISTANCE_METERS);

  // A Set of zero categories correctly yields zero candidates below — no
  // special-casing "empty preferences" is needed.
  const selected = new Set<PlaceCategory>(selectedCategories);

  const candidates: AdvisorCandidate[] = [];

  for (const { place, source, priority } of eligiblePlaces) {
    if (place.id === hotelPlaceId) continue;
    if (!selected.has(place.category)) continue;

    const distance = distanceMeters(hotelLocation, { lat: place.latitude, lng: place.longitude });
    if (distance > maxDistance) continue;

    candidates.push({
      place,
      distanceMeters: distance,
      isPartner: source === "partner",
      partnerPriority: source === "partner" ? priority : null,
    });
  }

  return candidates;
}
