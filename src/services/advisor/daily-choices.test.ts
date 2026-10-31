import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Place } from "@/db/schema";
import type { EligiblePlace } from "@/services/eligibility/rules";
import { buildDailyChoices, CHOICES_PER_STEP, type BuildDailyChoicesInput } from "./daily-choices";
import { makeTestPlace } from "./test-utils";

const HOTEL = { lat: 41.7, lng: 44.8 };
const hotelPlace = makeTestPlace({ id: "hotel-place", category: "hotel", latitude: HOTEL.lat, longitude: HOTEL.lng });

// ~111 m per 0.001° of latitude: n -> about n*111 m north of the hotel.
const near = (id: string, n: number, extra: Partial<Place> = {}) =>
  makeTestPlace({ id, name: id, category: "restaurant", latitude: HOTEL.lat + n * 0.001, longitude: HOTEL.lng, visitDurationMinutes: 30, ...extra });

const partner = (place: Place, extra: Partial<EligiblePlace> = {}): EligiblePlace => ({
  place,
  source: "partner",
  relationId: `p-${place.id}`,
  priority: null,
  facilityType: null,
  featured: false,
  offerText: null,
  ...extra,
});
const facility = (place: Place, extra: Partial<EligiblePlace> = {}): EligiblePlace => ({
  place,
  source: "facility",
  relationId: `f-${place.id}`,
  priority: null,
  facilityType: "other",
  featured: false,
  offerText: null,
  ...extra,
});

function input(eligiblePlaces: EligiblePlace[], extra: Partial<BuildDailyChoicesInput> = {}): BuildDailyChoicesInput {
  return {
    eligiblePlaces,
    hotelPlaceId: hotelPlace.id,
    hotelLocation: HOTEL,
    origin: HOTEL,
    categories: ["restaurant", "spa"],
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
      partner(near("featured", 9), { featured: true, offerText: "10% off for hotel guests" }),
    ];
    const choices = buildDailyChoices(input(pool));
    assert.equal(choices.length, 3);
    assert.equal(choices[0].placeId, "featured");
    assert.equal(choices[0].featured, true);
    assert.equal(choices[0].offerText, "10% off for hotel guests");
  });

  it("does not offer a featured partner that does not fit the time left", () => {
    const pool = [partner(near("p1", 1)), partner(near("far-featured", 60), { featured: true })]; // ~6.7 km away
    const choices = buildDailyChoices(input(pool, { remainingMinutes: 60 }));
    assert.deepEqual(
      choices.map((choice) => choice.placeId),
      ["p1"]
    );
  });

  it("does not offer a featured partner outside the guest's interests", () => {
    const pool = [partner(near("museum", 1, { category: "museum" }), { featured: true }), partner(near("p1", 2))];
    assert.deepEqual(
      buildDailyChoices(input(pool)).map((choice) => choice.placeId),
      ["p1"]
    );
  });

  it("never marks a hotel facility as featured", () => {
    const choices = buildDailyChoices(input([facility(near("sauna", 1, { category: "spa" }), { featured: true, offerText: "x" })]));
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
});
