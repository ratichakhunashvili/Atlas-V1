import { describe, test } from "node:test";
import assert from "node:assert/strict";
import {
  CABLE_CAR,
  CORNER_CAFE,
  DEMO_DATA,
  DEMO_HOTEL_A,
  DEMO_HOTEL_B,
  ROOFTOP_SPA,
  WINE_CELLAR,
  type DemoData,
} from "./fixtures";
import { findDemoHotelByQrToken, getEligibleExperiencesForDemoHotel } from "./eligibility";

const NOW = new Date("2026-06-15T12:00:00Z");
const ids = (hotelId: string, data: DemoData = DEMO_DATA) => getEligibleExperiencesForDemoHotel(hotelId, NOW, data).map((e) => e.place.id).sort();

describe("prototype eligibility (fixtures)", () => {
  test("Hotel A sees both Atlas partners and its own facility", () => {
    assert.deepEqual(ids(DEMO_HOTEL_A.id), [CABLE_CAR.id, ROOFTOP_SPA.id, WINE_CELLAR.id].sort());
  });

  test("Hotel B sees both Atlas partners too: a contract, not a hotel partnership, decides visibility", () => {
    assert.deepEqual(ids(DEMO_HOTEL_B.id), [CABLE_CAR.id, WINE_CELLAR.id].sort());
  });

  test("Hotel A's partnership promotes the wine cellar for Hotel A's guests only", () => {
    const wineFor = (hotelId: string) => getEligibleExperiencesForDemoHotel(hotelId, NOW).find((e) => e.place.id === WINE_CELLAR.id);
    assert.notEqual(wineFor(DEMO_HOTEL_A.id)?.promotion, null);
    assert.equal(wineFor(DEMO_HOTEL_B.id)?.promotion, null);
  });

  test("Hotel A's facility is shown to Hotel A guests only, without any partnership row", () => {
    assert.ok(ids(DEMO_HOTEL_A.id).includes(ROOFTOP_SPA.id));
    assert.equal(ids(DEMO_HOTEL_B.id).includes(ROOFTOP_SPA.id), false);
    assert.equal(DEMO_DATA.partnerships.some((row) => row.placeId === ROOFTOP_SPA.id), false);
    const spa = getEligibleExperiencesForDemoHotel(DEMO_HOTEL_A.id, NOW).find((e) => e.place.id === ROOFTOP_SPA.id);
    assert.equal(spa?.source, "facility");
  });

  test("the nearby non-partner is excluded for every hotel", () => {
    for (const hotel of DEMO_DATA.hotels) {
      assert.equal(ids(hotel.id).includes(CORNER_CAFE.id), false, `${hotel.name} must not be offered the corner café`);
    }
  });

  test("an unknown hotel id yields nothing (never a fallback to 'everything')", () => {
    assert.deepEqual(ids("demo-hotel-unknown"), []);
    assert.deepEqual(ids(""), []);
  });

  test("a contract that is not active is excluded for every hotel (pending / suspended / ended)", () => {
    for (const status of ["pending_review", "suspended", "ended"] as const) {
      const data: DemoData = {
        ...DEMO_DATA,
        contracts: DEMO_DATA.contracts.map((row) => (row.placeId === WINE_CELLAR.id ? { ...row, status } : row)),
      };
      for (const hotel of DEMO_DATA.hotels) assert.equal(ids(hotel.id, data).includes(WINE_CELLAR.id), false, status);
    }
  });

  test("an inactive facility is excluded", () => {
    const data: DemoData = { ...DEMO_DATA, facilities: DEMO_DATA.facilities.map((row) => ({ ...row, status: "inactive" as const })) };
    assert.equal(ids(DEMO_HOTEL_A.id, data).includes(ROOFTOP_SPA.id), false);
  });
});

describe("hotel identified from the demo QR link only", () => {
  test("a known demo token resolves to its hotel", () => {
    assert.equal(findDemoHotelByQrToken(DEMO_HOTEL_A.demoQrToken)?.id, DEMO_HOTEL_A.id);
    assert.equal(findDemoHotelByQrToken(DEMO_HOTEL_B.demoQrToken)?.id, DEMO_HOTEL_B.id);
  });

  test("an unknown, empty or hotel-id-shaped token resolves to nothing", () => {
    assert.equal(findDemoHotelByQrToken("nope"), null);
    assert.equal(findDemoHotelByQrToken(""), null);
    assert.equal(findDemoHotelByQrToken(DEMO_HOTEL_A.id), null, "a hotel id is not a QR token");
  });
});
