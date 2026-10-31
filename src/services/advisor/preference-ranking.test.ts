import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { Place } from "@/db/schema";
import type { EligiblePlace } from "@/services/eligibility/rules";
import { buildCandidates, MAX_CANDIDATE_DISTANCE_METERS } from "./candidates";
import { applyPaceToStopCount, effectiveMaxDistanceMeters, paceStopCap, priceFit, priceFitRank } from "./preference-ranking";
import { rankCandidates } from "./scoring";
import { chooseStops } from "./stop-selection";
import { makeTestPlace } from "./test-utils";

const HOTEL = { lat: 0, lng: 0 };

function latOffsetForMeters(meters: number): number {
  return (meters / 6371000) * (180 / Math.PI);
}

function partner(place: Place): EligiblePlace {
  return { place, source: "partner", relationId: `p-${place.id}`, priority: null, facilityType: null };
}

function candidatesFor(places: Place[], extra: { preferredMaxDistanceMeters?: number | null } = {}) {
  return buildCandidates({
    hotelLocation: HOTEL,
    hotelPlaceId: "hotel-place",
    eligiblePlaces: places.map(partner),
    selectedCategories: ["restaurant"],
    ...extra,
  });
}

describe("spending tier", () => {
  test("price fit: known fits, known over, unknown is its own answer, no preference is nothing", () => {
    assert.equal(priceFit(1, "moderate"), "fits");
    assert.equal(priceFit(2, "moderate"), "fits");
    assert.equal(priceFit(3, "moderate"), "over");
    assert.equal(priceFit(null, "budget"), "unknown");
    assert.equal(priceFit(3, null), null);
    assert.equal(priceFit(null, null), null);
  });

  test("an unknown price ranks after a fitting one and is never treated as fitting", () => {
    assert.ok(priceFitRank(1, "budget") < priceFitRank(null, "budget"));
    assert.ok(priceFitRank(null, "budget") < priceFitRank(3, "budget"));
  });

  test("ranking prefers fitting prices, then unknown, then over — among equally eligible Places", () => {
    const over = makeTestPlace({ category: "restaurant", priceLevel: 3, latitude: latOffsetForMeters(100) });
    const unknown = makeTestPlace({ category: "restaurant", priceLevel: null, latitude: latOffsetForMeters(200) });
    const fits = makeTestPlace({ category: "restaurant", priceLevel: 1, latitude: latOffsetForMeters(900) });

    const ranked = rankCandidates(candidatesFor([over, unknown, fits]), new Map(), { budget: "budget" });
    assert.deepEqual(
      ranked.map((c) => c.place.id),
      [fits.id, unknown.id, over.id]
    );
  });

  test("without a spending preference the order is exactly the old one (distance), price ignored", () => {
    const near = makeTestPlace({ category: "restaurant", priceLevel: 3, latitude: latOffsetForMeters(100) });
    const far = makeTestPlace({ category: "restaurant", priceLevel: 1, latitude: latOffsetForMeters(900) });
    const withPrefs = rankCandidates(candidatesFor([far, near]), new Map(), { budget: null });
    const without = rankCandidates(candidatesFor([far, near]), new Map());
    assert.deepEqual(withPrefs.map((c) => c.place.id), [near.id, far.id]);
    assert.deepEqual(without.map((c) => c.place.id), [near.id, far.id]);
  });

  test("a spending preference never removes or adds an eligible Place", () => {
    const places = [
      makeTestPlace({ category: "restaurant", priceLevel: 3, latitude: latOffsetForMeters(100) }),
      makeTestPlace({ category: "restaurant", priceLevel: 1, latitude: latOffsetForMeters(200) }),
    ];
    const candidates = candidatesFor(places);
    const chosen = chooseStops({ candidates, usageHistory: new Map(), targetCount: 10, preferences: { budget: "budget" } });
    assert.deepEqual(new Set(chosen.map((c) => c.place.id)), new Set(places.map((p) => p.id)));
  });
});

describe("distance preference", () => {
  test("narrows the candidate radius", () => {
    const near = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(500) });
    const mid = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(2500) });
    const result = candidatesFor([near, mid], { preferredMaxDistanceMeters: 1000 });
    assert.deepEqual(result.map((c) => c.place.id), [near.id]);
  });

  test("can never widen the 5 km cap, whatever is asked", () => {
    const far = makeTestPlace({ category: "restaurant", latitude: latOffsetForMeters(MAX_CANDIDATE_DISTANCE_METERS + 500) });
    assert.equal(candidatesFor([far], { preferredMaxDistanceMeters: 50_000 }).length, 0);
    assert.equal(effectiveMaxDistanceMeters(50_000, MAX_CANDIDATE_DISTANCE_METERS), MAX_CANDIDATE_DISTANCE_METERS);
    assert.equal(effectiveMaxDistanceMeters(null, MAX_CANDIDATE_DISTANCE_METERS), MAX_CANDIDATE_DISTANCE_METERS);
    assert.equal(effectiveMaxDistanceMeters(-5, MAX_CANDIDATE_DISTANCE_METERS), MAX_CANDIDATE_DISTANCE_METERS);
    assert.equal(effectiveMaxDistanceMeters(Number.NaN, MAX_CANDIDATE_DISTANCE_METERS), MAX_CANDIDATE_DISTANCE_METERS);
  });
});

describe("activity pace", () => {
  test("trims the earned stop count, never raises it", () => {
    assert.equal(applyPaceToStopCount(4, "low"), 3);
    assert.equal(applyPaceToStopCount(2, "low"), 2);
    assert.equal(applyPaceToStopCount(4, "moderate"), 4);
    assert.equal(applyPaceToStopCount(8, "moderate"), 5);
    assert.equal(applyPaceToStopCount(6, "high"), 6);
    assert.equal(applyPaceToStopCount(4, null), 4);
    assert.equal(paceStopCap(null), null);
  });
});
