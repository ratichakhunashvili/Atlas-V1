import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { DEMO_DATA, DEMO_IDS, DEMO_HOTEL_A, DEMO_HOTEL_B, WINE_CELLAR, CABLE_CAR, ROOFTOP_SPA, CORNER_CAFE } from "./fixtures";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("fixture ids are stable", () => {
  test("every fixture id is a fixed, valid UUID", () => {
    for (const [name, id] of Object.entries(DEMO_IDS)) assert.match(id, UUID, name);
  });

  test("ids are unique across all fixtures", () => {
    const all = Object.values(DEMO_IDS);
    assert.equal(new Set(all).size, all.length);
  });

  test("the fixtures use exactly those ids (nothing generated at import time)", () => {
    assert.equal(DEMO_HOTEL_A.id, DEMO_IDS.hotelA);
    assert.equal(DEMO_HOTEL_B.id, DEMO_IDS.hotelB);
    assert.equal(WINE_CELLAR.id, DEMO_IDS.placeWineCellar);
    assert.equal(CABLE_CAR.id, DEMO_IDS.placeCableCar);
    assert.equal(ROOFTOP_SPA.id, DEMO_IDS.placeRooftopSpa);
    assert.equal(CORNER_CAFE.id, DEMO_IDS.placeCornerCafe);
    assert.deepEqual(
      DEMO_DATA.partnerships.map((row) => row.id),
      [DEMO_IDS.partnershipAWine, DEMO_IDS.partnershipACableCar, DEMO_IDS.partnershipBCableCar]
    );
    assert.deepEqual(DEMO_DATA.facilities.map((row) => row.id), [DEMO_IDS.facilityARooftopSpa]);
  });

  test("the pinned values never change (a change here would silently break anything that stored them)", () => {
    assert.equal(DEMO_IDS.hotelA, "00000000-0000-4000-8000-000000000031");
    assert.equal(DEMO_IDS.placeCornerCafe, "00000000-0000-4000-8000-000000000024");
  });

  test("the nearby non-partner has no relationship row of any kind", () => {
    assert.equal(DEMO_DATA.partnerships.some((row) => row.placeId === CORNER_CAFE.id), false);
    assert.equal(DEMO_DATA.facilities.some((row) => row.placeId === CORNER_CAFE.id), false);
  });
});
