import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { PartnershipStatus } from "@/db/schema";
import { makeTestPlace } from "@/services/advisor/test-utils";
import {
  buildEligiblePlaces,
  filterEligibleByRadius,
  isPartnershipEligible,
  type FacilityRow,
  type PartnershipRow,
} from "./rules";

const NOW = new Date("2026-06-15T12:00:00Z");
const HOTEL_A = "hotel-a";
const HOTEL_B = "hotel-b";
const HOTEL_A_PLACE = "hotel-a-place";

function partnership(overrides: Partial<PartnershipRow> & { hotelId: string; place: PartnershipRow["place"] }): PartnershipRow {
  return {
    id: `partnership-${overrides.hotelId}-${overrides.place.id}`,
    placeId: overrides.place.id,
    status: "active",
    startsAt: null,
    endsAt: null,
    confirmedAt: new Date("2026-01-01T00:00:00Z"),
    priority: null,
    ...overrides,
  };
}

function facilityRow(overrides: Partial<FacilityRow> & { hotelId: string; place: FacilityRow["place"] }): FacilityRow {
  return {
    id: `facility-${overrides.place.id}`,
    placeId: overrides.place.id,
    status: "active",
    facilityType: "pool",
    ...overrides,
  };
}

function eligibleIds(input: { hotelId: string; partnerships?: PartnershipRow[]; facilities?: FacilityRow[]; now?: Date }) {
  return buildEligiblePlaces({
    hotelId: input.hotelId,
    hotelPlaceId: input.hotelId === HOTEL_A ? HOTEL_A_PLACE : "hotel-b-place",
    partnerships: input.partnerships ?? [],
    facilities: input.facilities ?? [],
    now: input.now ?? NOW,
  }).map((entry) => entry.place.id);
}

describe("partner eligibility is hotel-specific", () => {
  const partnerA = makeTestPlace({ id: "partner-a", category: "restaurant" });

  test("1. Hotel A receives Partner A when Hotel A has an active relationship", () => {
    assert.deepEqual(eligibleIds({ hotelId: HOTEL_A, partnerships: [partnership({ hotelId: HOTEL_A, place: partnerA })] }), ["partner-a"]);
  });

  test("2. Hotel B does not receive Partner A without its own relationship (even if Hotel A's row is passed in by mistake)", () => {
    // Correctly scoped: Hotel B has no rows.
    assert.deepEqual(eligibleIds({ hotelId: HOTEL_B, partnerships: [] }), []);
    // Defense in depth: a caller bug that leaks Hotel A's row into Hotel B's query still yields nothing.
    assert.deepEqual(eligibleIds({ hotelId: HOTEL_B, partnerships: [partnership({ hotelId: HOTEL_A, place: partnerA })] }), []);
  });

  test("6. a Place explicitly partnered with two hotels is eligible for those two hotels only", () => {
    const shared = makeTestPlace({ id: "shared", category: "restaurant" });
    const rows = [partnership({ hotelId: HOTEL_A, place: shared }), partnership({ hotelId: HOTEL_B, place: shared })];
    assert.deepEqual(eligibleIds({ hotelId: HOTEL_A, partnerships: rows }), ["shared"]);
    assert.deepEqual(eligibleIds({ hotelId: HOTEL_B, partnerships: rows }), ["shared"]);
    assert.deepEqual(eligibleIds({ hotelId: "hotel-c", partnerships: rows }), []);
  });

  test("a partnership that exists only for Hotel A does not make the Place eligible for Hotel B's own pair of rows", () => {
    const onlyA = makeTestPlace({ id: "only-a", category: "spa" });
    const rows = [partnership({ hotelId: HOTEL_A, place: onlyA })];
    assert.deepEqual(eligibleIds({ hotelId: HOTEL_B, partnerships: rows }), []);
  });
});

describe("partnership lifecycle", () => {
  const place = makeTestPlace({ id: "p1", category: "restaurant" });

  for (const status of ["pending_review", "suspended", "revoked"] as PartnershipStatus[]) {
    test(`a ${status} partnership is not eligible`, () => {
      assert.deepEqual(eligibleIds({ hotelId: HOTEL_A, partnerships: [partnership({ hotelId: HOTEL_A, place, status })] }), []);
    });
  }

  test("an active row with no confirmation timestamp is never eligible (legacy/unconfirmed data can't leak through)", () => {
    assert.deepEqual(eligibleIds({ hotelId: HOTEL_A, partnerships: [partnership({ hotelId: HOTEL_A, place, confirmedAt: null })] }), []);
  });

  test("an expired partnership is not eligible; one ending in the future is", () => {
    const expired = partnership({ hotelId: HOTEL_A, place, endsAt: new Date("2026-06-15T11:59:59Z") });
    const endsAtNow = partnership({ hotelId: HOTEL_A, place, endsAt: NOW });
    const live = partnership({ hotelId: HOTEL_A, place, endsAt: new Date("2026-12-31T00:00:00Z") });
    assert.equal(isPartnershipEligible(expired, HOTEL_A, NOW), false);
    assert.equal(isPartnershipEligible(endsAtNow, HOTEL_A, NOW), false, "end is exclusive");
    assert.equal(isPartnershipEligible(live, HOTEL_A, NOW), true);
  });

  test("a partnership that has not started yet is not eligible", () => {
    const future = partnership({ hotelId: HOTEL_A, place, startsAt: new Date("2026-07-01T00:00:00Z") });
    const startedNow = partnership({ hotelId: HOTEL_A, place, startsAt: NOW });
    assert.equal(isPartnershipEligible(future, HOTEL_A, NOW), false);
    assert.equal(isPartnershipEligible(startedNow, HOTEL_A, NOW), true);
  });

  test("an archived Place is never eligible, even with an active partnership or active facility", () => {
    const archived = makeTestPlace({ id: "archived", category: "restaurant", archivedAt: new Date("2026-05-01T00:00:00Z") });
    assert.deepEqual(eligibleIds({ hotelId: HOTEL_A, partnerships: [partnership({ hotelId: HOTEL_A, place: archived })] }), []);
    assert.deepEqual(eligibleIds({ hotelId: HOTEL_A, facilities: [facilityRow({ hotelId: HOTEL_A, place: archived })] }), []);
  });
});

describe("hotel-owned facilities", () => {
  test("5. a hotel-owned facility is eligible for its own hotel without any external partnership", () => {
    const pool = makeTestPlace({ id: "pool", category: "other" });
    const result = buildEligiblePlaces({
      hotelId: HOTEL_A,
      hotelPlaceId: HOTEL_A_PLACE,
      partnerships: [],
      facilities: [facilityRow({ hotelId: HOTEL_A, place: pool, facilityType: "pool" })],
      now: NOW,
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].source, "facility");
    assert.equal(result[0].facilityType, "pool");
  });

  test("a facility is NOT eligible for a different hotel's guests", () => {
    const pool = makeTestPlace({ id: "pool", category: "other" });
    assert.deepEqual(eligibleIds({ hotelId: HOTEL_B, facilities: [facilityRow({ hotelId: HOTEL_A, place: pool })] }), []);
  });

  test("an inactive facility is not eligible", () => {
    const sauna = makeTestPlace({ id: "sauna", category: "spa" });
    assert.deepEqual(eligibleIds({ hotelId: HOTEL_A, facilities: [facilityRow({ hotelId: HOTEL_A, place: sauna, status: "inactive" })] }), []);
  });

  test("a Place present as both facility and partner is reported once, as the hotel's own facility", () => {
    const both = makeTestPlace({ id: "both", category: "spa" });
    const result = buildEligiblePlaces({
      hotelId: HOTEL_A,
      hotelPlaceId: HOTEL_A_PLACE,
      partnerships: [partnership({ hotelId: HOTEL_A, place: both })],
      facilities: [facilityRow({ hotelId: HOTEL_A, place: both })],
      now: NOW,
    });
    assert.equal(result.length, 1);
    assert.equal(result[0].source, "facility");
  });

  test("the hotel's own Place is never returned as an external destination", () => {
    const own = makeTestPlace({ id: HOTEL_A_PLACE, category: "hotel" });
    assert.deepEqual(eligibleIds({ hotelId: HOTEL_A, partnerships: [partnership({ hotelId: HOTEL_A, place: own })] }), []);
  });
});

describe("filterEligibleByRadius", () => {
  test("only narrows an already-eligible set; it can never add a Place", () => {
    const near = makeTestPlace({ id: "near", category: "restaurant", latitude: 0.001, longitude: 0 });
    const far = makeTestPlace({ id: "far", category: "restaurant", latitude: 1, longitude: 0 });
    const eligible = buildEligiblePlaces({
      hotelId: HOTEL_A,
      hotelPlaceId: HOTEL_A_PLACE,
      partnerships: [partnership({ hotelId: HOTEL_A, place: near }), partnership({ hotelId: HOTEL_A, place: far })],
      facilities: [],
      now: NOW,
    });
    const narrowed = filterEligibleByRadius(eligible, { lat: 0, lng: 0 }, 1000);
    assert.deepEqual(narrowed.map((e) => e.place.id), ["near"]);
    // An unrelated, non-eligible Place at the exact search centre is simply absent from the input, so no radius can surface it.
    assert.equal(filterEligibleByRadius(eligible, { lat: 0, lng: 0 }, 5_000_000).length, 2);
  });
});

describe("the Place itself must be published, verified and not archived", () => {
  const cases: Array<[string, Partial<Parameters<typeof makeTestPlace>[0]>]> = [
    ["a draft (unpublished) Place", { publicationStatus: "draft", publishedAt: null }],
    ["an unverified Place", { verificationStatus: "unverified", verifiedAt: null }],
    ["a draft AND unverified Place", { publicationStatus: "draft", publishedAt: null, verificationStatus: "unverified", verifiedAt: null }],
    ["an archived Place", { archivedAt: new Date("2026-05-01T00:00:00Z") }],
  ];

  for (const [label, overrides] of cases) {
    test(`${label} is excluded as an external partner, even with an active confirmed partnership`, () => {
      const place = makeTestPlace({ id: "p", category: "restaurant", ...overrides });
      assert.deepEqual(eligibleIds({ hotelId: HOTEL_A, partnerships: [partnership({ hotelId: HOTEL_A, place })] }), []);
    });

    test(`${label} is excluded as a hotel facility too`, () => {
      const place = makeTestPlace({ id: "f", category: "spa", ...overrides });
      assert.deepEqual(eligibleIds({ hotelId: HOTEL_A, facilities: [facilityRow({ hotelId: HOTEL_A, place })] }), []);
    });
  }

  test("a published AND verified Place with an active confirmed partnership is eligible", () => {
    const place = makeTestPlace({ id: "ok", category: "restaurant", publicationStatus: "published", verificationStatus: "verified" });
    assert.deepEqual(eligibleIds({ hotelId: HOTEL_A, partnerships: [partnership({ hotelId: HOTEL_A, place })] }), ["ok"]);
  });
});
