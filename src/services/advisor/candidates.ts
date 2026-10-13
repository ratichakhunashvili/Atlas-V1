import { distanceMeters, type LatLng } from "@/lib/geo";
import type { Place, PlaceCategory } from "@/db/schema";

/** Keeps a day's round trip to a realistic walking distance — matches Map Advisor Functional's original MAX_CANDIDATE_DISTANCE_METERS exactly. */
export const MAX_CANDIDATE_DISTANCE_METERS = 5000;

/** A hotel_places row, narrowed to what candidate-building needs. Scoped to one hotel by the caller — this module never queries the DB, so "is this Place a partner" is only ever true relative to whatever relations were passed in. */
export type HotelPlaceRelation = {
  placeId: string;
  priority: number | null;
};

export type AdvisorCandidate = {
  place: Place;
  distanceMeters: number;
  isPartner: boolean;
  partnerPriority: number | null;
};

export type BuildCandidatesInput = {
  /** The hotel's own location — the round-trip origin, not a candidate itself. */
  hotelLocation: LatLng;
  /** The hotel's own Place id, excluded from the pool: visiting the hotel itself isn't a candidate stop — see the (separate, later) hotel-filler concept. */
  hotelPlaceId: string;
  /** Already-loaded nearby Places (however the caller fetched them — this module does its own exact distance filter regardless of what radius they were queried with). */
  nearbyPlaces: readonly Place[];
  /** The user's selected categories (user_preferences.categories). Empty means no eligible candidates — never a silently-invented fallback. */
  selectedCategories: readonly PlaceCategory[];
  /** hotel_places rows for this hotel only. */
  hotelPlaceRelations: readonly HotelPlaceRelation[];
};

/**
 * Pure candidate-pool construction: distance <= 5000m from the hotel AND
 * category in the user's selected categories — exactly Map Advisor
 * Functional's original rule (MAX_CANDIDATE_DISTANCE_METERS + preference
 * filtering), reimplemented against Atlas's one Place model instead of
 * separate attractions/partners tables. No DB access, no randomness, no
 * itinerary assembly — just the eligible pool.
 */
export function buildCandidates(input: BuildCandidatesInput): AdvisorCandidate[] {
  const { hotelLocation, hotelPlaceId, nearbyPlaces, selectedCategories, hotelPlaceRelations } = input;

  const relationByPlaceId = new Map(hotelPlaceRelations.map((relation) => [relation.placeId, relation]));
  // A Set of zero categories correctly yields zero candidates below — no
  // special-casing "empty preferences" is needed.
  const selected = new Set<PlaceCategory>(selectedCategories);

  const candidates: AdvisorCandidate[] = [];

  for (const place of nearbyPlaces) {
    if (place.id === hotelPlaceId) continue;
    if (!selected.has(place.category)) continue;

    const distance = distanceMeters(hotelLocation, { lat: place.latitude, lng: place.longitude });
    if (distance > MAX_CANDIDATE_DISTANCE_METERS) continue;

    const relation = relationByPlaceId.get(place.id);
    candidates.push({
      place,
      distanceMeters: distance,
      isPartner: relation !== undefined,
      partnerPriority: relation?.priority ?? null,
    });
  }

  return candidates;
}
