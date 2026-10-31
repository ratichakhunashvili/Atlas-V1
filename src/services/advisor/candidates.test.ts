import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Place } from "@/db/schema";
import type { EligiblePlace } from "@/services/eligibility/rules";
import { buildCandidates, MAX_CANDIDATE_DISTANCE_METERS } from "./candidates";
import { makeTestPlace } from "./test-utils";

const HOTEL_LOCATION = { lat: 0, lng: 0 };
const HOTEL_PLACE_ID = "hotel-place";

/** Exact due-north offset for a target great-circle distance — Haversine along a meridian reduces to `distance = EARTH_RADIUS_M * angleRadians`, so this is an exact inverse, not an approximation. Mirrors lib/geo.ts's own EARTH_RADIUS_M. */
function latOffsetForMeters(meters: number): number {
  const EARTH_RADIUS_M = 6371000;
  return (meters / EARTH_RADIUS_M) * (180 / Math.PI);
}

/** buildCandidates only ever receives already-ELIGIBLE places; these wrap fixtures the way services/eligibility would. */
function facility(place: Place): EligiblePlace {
  return { place, source: "facility", relationId: `facility-${place.id}`, priority: null, facilityType: "other" };
}

function partner(place: Place, priority: number | null = null): EligiblePlace {
  return { place, source: "partner", relationId: `partnership-${place.id}`, priority, facilityType: null };
}

describe("buildCandidates", () => {
  test("includes an eligible Place within 5km with a selected category", () => {
    const place = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(1000) });
    const result = buildCandidates({
      hotelLocation: HOTEL_LOCATION,
      hotelPlaceId: HOTEL_PLACE_ID,
      eligiblePlaces: [facility(place)],
      selectedCategories: ["restaurant"],
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].place.id, place.id);
  });

  test("excludes an eligible Place outside 5km", () => {
    const place = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(6000) });
    const result = buildCandidates({
      hotelLocation: HOTEL_LOCATION,
      hotelPlaceId: HOTEL_PLACE_ID,
      eligiblePlaces: [facility(place)],
      selectedCategories: ["restaurant"],
    });
    assert.equal(result.length, 0);
  });

  test("excludes a Place with an unselected category", () => {
    const place = makeTestPlace({ category: "museum", latitude: latOffsetForMeters(500) });
    const result = buildCandidates({
      hotelLocation: HOTEL_LOCATION,
      hotelPlaceId: HOTEL_PLACE_ID,
      eligiblePlaces: [facility(place)],
      selectedCategories: ["restaurant"],
    });
    assert.equal(result.length, 0);
  });

  test("excludes a Place with a selected category but >5km away", () => {
    const place = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(5500) });
    const result = buildCandidates({
      hotelLocation: HOTEL_LOCATION,
      hotelPlaceId: HOTEL_PLACE_ID,
      eligiblePlaces: [partner(place)],
      selectedCategories: ["restaurant"],
    });
    assert.equal(result.length, 0);
  });

  test("empty selected categories yields no candidates, even for an otherwise-perfect Place", () => {
    const place = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(100) });
    const result = buildCandidates({
      hotelLocation: HOTEL_LOCATION,
      hotelPlaceId: HOTEL_PLACE_ID,
      eligiblePlaces: [partner(place)],
      selectedCategories: [],
    });
    assert.equal(result.length, 0);
  });

  test("boundary: a Place at ~5000m is included, one at 5001m is excluded", () => {
    const atLimit = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(5000) });
    const justOver = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(5001) });

    const result = buildCandidates({
      hotelLocation: HOTEL_LOCATION,
      hotelPlaceId: HOTEL_PLACE_ID,
      eligiblePlaces: [facility(atLimit), facility(justOver)],
      selectedCategories: ["restaurant"],
    });

    assert.equal(result.length, 1);
    assert.equal(result[0].place.id, atLimit.id);
    // Confirm the boundary fixture really is at the limit, not just "close enough" by luck.
    assert.ok(Math.abs(result[0].distanceMeters - MAX_CANDIDATE_DISTANCE_METERS) < 0.01);
  });

  test("excludes the hotel's own Place even if it matches category + distance", () => {
    const hotelPlace = makeTestPlace({ id: HOTEL_PLACE_ID, category: "hotel", latitude: 0, longitude: 0 });
    const result = buildCandidates({
      hotelLocation: HOTEL_LOCATION,
      hotelPlaceId: HOTEL_PLACE_ID,
      eligiblePlaces: [facility(hotelPlace)],
      selectedCategories: ["hotel"],
    });
    assert.equal(result.length, 0);
  });

  test("a partner-sourced Place is a partner carrying its priority; a hotel-owned facility is eligible but NOT a partner", () => {
    const partnerPlace = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(200) });
    const facilityPlace = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(300) });

    const result = buildCandidates({
      hotelLocation: HOTEL_LOCATION,
      hotelPlaceId: HOTEL_PLACE_ID,
      eligiblePlaces: [partner(partnerPlace, 2), facility(facilityPlace)],
      selectedCategories: ["restaurant"],
    });

    const partnerCandidate = result.find((c) => c.place.id === partnerPlace.id);
    const facilityCandidate = result.find((c) => c.place.id === facilityPlace.id);
    assert.equal(partnerCandidate?.isPartner, true);
    assert.equal(partnerCandidate?.partnerPriority, 2);
    assert.equal(facilityCandidate?.isPartner, false);
    assert.equal(facilityCandidate?.partnerPriority, null);
  });

  test("a Place that is not in the eligible set can never become a candidate (the pool is the eligible set, nothing else)", () => {
    const eligible = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(200) });
    // A very attractive nearby Place that exists in the database but was never passed in as eligible.
    makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(50) });

    const result = buildCandidates({
      hotelLocation: HOTEL_LOCATION,
      hotelPlaceId: HOTEL_PLACE_ID,
      eligiblePlaces: [partner(eligible)],
      selectedCategories: ["restaurant"],
    });

    assert.deepEqual(
      result.map((c) => c.place.id),
      [eligible.id]
    );
  });
});
