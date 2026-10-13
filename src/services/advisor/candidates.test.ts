import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildCandidates, MAX_CANDIDATE_DISTANCE_METERS, type HotelPlaceRelation } from "./candidates";
import { makeTestPlace } from "./test-utils";

const HOTEL_LOCATION = { lat: 0, lng: 0 };
const HOTEL_PLACE_ID = "hotel-place";

/** Exact due-north offset for a target great-circle distance — Haversine along a meridian reduces to `distance = EARTH_RADIUS_M * angleRadians`, so this is an exact inverse, not an approximation. Mirrors lib/geo.ts's own EARTH_RADIUS_M. */
function latOffsetForMeters(meters: number): number {
  const EARTH_RADIUS_M = 6371000;
  return (meters / EARTH_RADIUS_M) * (180 / Math.PI);
}

describe("buildCandidates", () => {
  test("includes a Place within 5km with a selected category", () => {
    const place = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(1000) });
    const result = buildCandidates({
      hotelLocation: HOTEL_LOCATION,
      hotelPlaceId: HOTEL_PLACE_ID,
      nearbyPlaces: [place],
      selectedCategories: ["restaurant"],
      hotelPlaceRelations: [],
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].place.id, place.id);
  });

  test("excludes a Place outside 5km", () => {
    const place = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(6000) });
    const result = buildCandidates({
      hotelLocation: HOTEL_LOCATION,
      hotelPlaceId: HOTEL_PLACE_ID,
      nearbyPlaces: [place],
      selectedCategories: ["restaurant"],
      hotelPlaceRelations: [],
    });
    assert.equal(result.length, 0);
  });

  test("excludes a Place with an unselected category", () => {
    const place = makeTestPlace({ category: "museum", latitude: latOffsetForMeters(500) });
    const result = buildCandidates({
      hotelLocation: HOTEL_LOCATION,
      hotelPlaceId: HOTEL_PLACE_ID,
      nearbyPlaces: [place],
      selectedCategories: ["restaurant"],
      hotelPlaceRelations: [],
    });
    assert.equal(result.length, 0);
  });

  test("excludes a Place with a selected category but >5km away", () => {
    const place = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(5500) });
    const result = buildCandidates({
      hotelLocation: HOTEL_LOCATION,
      hotelPlaceId: HOTEL_PLACE_ID,
      nearbyPlaces: [place],
      selectedCategories: ["restaurant"],
      hotelPlaceRelations: [],
    });
    assert.equal(result.length, 0);
  });

  test("empty selected categories yields no candidates, even for an otherwise-perfect Place", () => {
    const place = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(100) });
    const result = buildCandidates({
      hotelLocation: HOTEL_LOCATION,
      hotelPlaceId: HOTEL_PLACE_ID,
      nearbyPlaces: [place],
      selectedCategories: [],
      hotelPlaceRelations: [],
    });
    assert.equal(result.length, 0);
  });

  test("boundary: a Place at ~5000m is included, one at 5001m is excluded", () => {
    const atLimit = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(5000) });
    const justOver = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(5001) });

    const result = buildCandidates({
      hotelLocation: HOTEL_LOCATION,
      hotelPlaceId: HOTEL_PLACE_ID,
      nearbyPlaces: [atLimit, justOver],
      selectedCategories: ["restaurant"],
      hotelPlaceRelations: [],
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
      nearbyPlaces: [hotelPlace],
      selectedCategories: ["hotel"],
      hotelPlaceRelations: [],
    });
    assert.equal(result.length, 0);
  });

  test("marks a Place as a partner only when a hotel_places relation exists for it, carrying its priority", () => {
    const partnerPlace = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(200) });
    const plainPlace = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(300) });
    const relations: HotelPlaceRelation[] = [{ placeId: partnerPlace.id, priority: 2 }];

    const result = buildCandidates({
      hotelLocation: HOTEL_LOCATION,
      hotelPlaceId: HOTEL_PLACE_ID,
      nearbyPlaces: [partnerPlace, plainPlace],
      selectedCategories: ["restaurant"],
      hotelPlaceRelations: relations,
    });

    const partnerCandidate = result.find((c) => c.place.id === partnerPlace.id);
    const plainCandidate = result.find((c) => c.place.id === plainPlace.id);
    assert.equal(partnerCandidate?.isPartner, true);
    assert.equal(partnerCandidate?.partnerPriority, 2);
    assert.equal(plainCandidate?.isPartner, false);
    assert.equal(plainCandidate?.partnerPriority, null);
  });
});
