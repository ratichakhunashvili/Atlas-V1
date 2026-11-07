import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Place } from "@/db/schema";
import type { EligiblePlace } from "@/services/eligibility/rules";
import { buildDailyChoices, CHOICES_PER_STEP, type BuildDailyChoicesInput } from "./daily-choices";
import { makeTestPlace } from "./test-utils";

const HOTEL = { lat: 41.7, lng: 44.8 };
const hotelPlace = makeTestPlace({ id: "hotel-place", category: "hotel", latitude: HOTEL.lat, longitude: HOTEL.lng });

// Distinct category groups, one per position, so the one-per-group rule doesn't hide what a test is about.
const VARIED = ["restaurant", "spa", "museum", "nature", "winery", "shop", "tour", "other"] as const;

// ~111 m per 0.001° of latitude: n -> about n*111 m north of the hotel.
const near = (id: string, n: number, extra: Partial<Place> = {}) =>
  makeTestPlace({
    id,
    name: id,
    category: VARIED[Math.abs(Math.round(n)) % VARIED.length],
    latitude: HOTEL.lat + n * 0.001,
    longitude: HOTEL.lng,
    visitDurationMinutes: 30,
    ...extra,
  });

const partner = (place: Place, extra: Partial<EligiblePlace> = {}): EligiblePlace => ({
  place,
  source: "partner",
  relationId: `p-${place.id}`,
  facilityType: null,
  promotion: { partnershipId: "promotion", priority: null, featured: false, offerText: null },
  ...extra,
});
/** A hotel partnership's promotion for an Atlas partner (the only thing that can feature it). */
const promoted = (fields: { featured?: boolean; offerText?: string | null }): Partial<EligiblePlace> => ({
  promotion: { partnershipId: "promotion", priority: null, featured: fields.featured ?? false, offerText: fields.offerText ?? null },
});
const facility = (place: Place, extra: Partial<EligiblePlace> = {}): EligiblePlace => ({
  place,
  source: "facility",
  relationId: `f-${place.id}`,
  facilityType: "other",
  promotion: null,
  ...extra,
});

function input(eligiblePlaces: EligiblePlace[], extra: Partial<BuildDailyChoicesInput> = {}): BuildDailyChoicesInput {
  return {
    eligiblePlaces,
    hotelPlaceId: hotelPlace.id,
    hotelLocation: HOTEL,
    origin: HOTEL,
    categories: [...VARIED],
    budget: null,
    preferredMaxDistanceMeters: null,
    excludePlaceIds: new Set(),
    remainingMinutes: 120,
    usageHistory: new Map(),
    ...extra,
  };
}

describe("buildDailyChoices", () => {
  it("offers at most three, and only from the eligible pool it is given", () => {
    const pool = [1, 2, 3, 4, 5].map((n) => partner(near(`p${n}`, n)));
    const choices = buildDailyChoices(input(pool));
    assert.equal(choices.length, CHOICES_PER_STEP);
    const allowed = new Set(pool.map((entry) => entry.place.id));
    for (const choice of choices) assert.ok(allowed.has(choice.placeId));
  });

  it("gives a featured partner one slot even when it would otherwise rank below three others", () => {
    const pool = [
      partner(near("p1", 1)),
      partner(near("p2", 2)),
      partner(near("p3", 3)),
      partner(near("featured", 9), promoted({ featured: true, offerText: "10% off for hotel guests" })),
    ];
    const choices = buildDailyChoices(input(pool));
    assert.equal(choices.length, 3);
    assert.equal(choices[0].placeId, "featured");
    assert.equal(choices[0].featured, true);
    assert.equal(choices[0].offerText, "10% off for hotel guests");
  });

  it("does not offer a featured partner that does not fit the time left", () => {
    const pool = [partner(near("p1", 1)), partner(near("far-featured", 60), promoted({ featured: true }))]; // ~6.7 km away
    const choices = buildDailyChoices(input(pool, { remainingMinutes: 60 }));
    assert.deepEqual(
      choices.map((choice) => choice.placeId),
      ["p1"]
    );
  });

  it("does not offer a featured partner outside the guest's interests", () => {
    const pool = [partner(near("museum", 2, { category: "museum" }), promoted({ featured: true })), partner(near("p1", 1, { category: "spa" }))];
    assert.deepEqual(
      buildDailyChoices(input(pool, { categories: ["restaurant", "spa"] })).map((choice) => choice.placeId),
      ["p1"]
    );
  });

  it("never marks a Place without a hotel promotion as featured", () => {
    const choices = buildDailyChoices(input([facility(near("sauna", 1, { category: "spa" }))]));
    assert.equal(choices[0].featured, false);
    assert.equal(choices[0].offerText, null);
  });

  it("offers fewer than three when fewer fit, and none when nothing fits", () => {
    const pool = [partner(near("p1", 1)), partner(near("p2", 40))]; // the second is ~4.4 km away
    assert.deepEqual(
      buildDailyChoices(input(pool, { remainingMinutes: 45 })).map((choice) => choice.placeId),
      ["p1"]
    );
    assert.deepEqual(buildDailyChoices(input(pool, { remainingMinutes: 10 })), []);
  });

  it("counts the walk back to the hotel from the place, starting from where the guest is", () => {
    const place = near("p1", 10); // ~1.1 km from the hotel: ~20 min each way with the detour allowance
    const fromHotel = buildDailyChoices(input([partner(place)], { remainingMinutes: 60 }));
    assert.equal(fromHotel.length, 0, "20 + 30 + 20 does not fit 60");
    const fromNextDoor = buildDailyChoices(input([partner(place)], { remainingMinutes: 60, origin: { lat: place.latitude, lng: place.longitude } }));
    assert.equal(fromNextDoor.length, 1, "0 + 30 + 20 fits 60");
  });

  it("never offers a place already part of today", () => {
    const pool = [partner(near("p1", 1)), partner(near("p2", 2))];
    assert.deepEqual(
      buildDailyChoices(input(pool, { excludePlaceIds: new Set(["p1"]) })).map((choice) => choice.placeId),
      ["p2"]
    );
  });

  it("never offers the hotel itself", () => {
    assert.deepEqual(buildDailyChoices(input([facility(hotelPlace)], { categories: ["hotel"] })), []);
  });

  it("never offers two places from the same category group at once, keeping the better-ranked one", () => {
    const pool = [
      partner(near("restaurant-near", 1, { category: "restaurant" })),
      partner(near("bar", 2, { category: "nightlife" })),
      partner(near("restaurant-far", 3, { category: "restaurant" })),
      partner(near("church", 4, { category: "historical" })),
    ];
    const ids = buildDailyChoices(input(pool, { categories: ["restaurant", "nightlife", "historical"] })).map((choice) => choice.placeId);
    assert.deepEqual(ids.sort(), ["church", "restaurant-near"]);
  });

  it("offers nothing from a group the day already has", () => {
    const pool = [partner(near("cafe", 1, { category: "restaurant" })), partner(near("museum", 2, { category: "museum" }))];
    const ids = buildDailyChoices(input(pool, { usedCategoryGroups: new Set(["food"] as const) })).map((choice) => choice.placeId);
    assert.deepEqual(ids, ["museum"]);
  });

  it("does not let a featured partner repeat a group the day already has", () => {
    const pool = [partner(near("featured-cafe", 1, { category: "restaurant" }), promoted({ featured: true })), partner(near("park", 2, { category: "nature" }))];
    const ids = buildDailyChoices(input(pool, { usedCategoryGroups: new Set(["food"] as const) })).map((choice) => choice.placeId);
    assert.deepEqual(ids, ["park"]);
  });
});
