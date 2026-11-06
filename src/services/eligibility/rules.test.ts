import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { AtlasContractStatus, Place } from "@/db/schema";
import { makeTestPlace } from "@/services/advisor/test-utils";
import {
  buildEligiblePlaces,
  filterEligibleByRadius,
  isContractEligible,
  isPartnershipEligible,
  type BuildEligiblePlacesInput,
  type ContractRow,
  type FacilityRow,
  type PartnershipRow,
} from "./rules";

/** The pure catalogue rule (docs/catalogue-model-plan.md §2). Service-level §9 tests are in eligibility.test.ts. */

const NOW = new Date("2026-06-15T12:00:00Z");
const CONFIRMED = new Date("2026-01-01T00:00:00Z");
const HOTEL_A = "hotel-a";
const HOTEL_B = "hotel-b";
const HOTEL_A_PLACE = "hotel-a-place";

function contract(place: Place, overrides: Partial<ContractRow> = {}): ContractRow {
  return { id: `contract-${place.id}`, placeId: place.id, status: "active", startsAt: null, endsAt: null, confirmedAt: CONFIRMED, place, ...overrides };
}

function partnership(hotelId: string, place: Place, overrides: Partial<PartnershipRow> = {}): PartnershipRow {
  return {
    id: `partnership-${hotelId}-${place.id}`,
    hotelId,
    placeId: place.id,
    status: "active",
    startsAt: null,
    endsAt: null,
    confirmedAt: CONFIRMED,
    priority: 2,
    featured: true,
    offerText: "Free dessert",
    place,
    ...overrides,
  };
}

function facility(hotelId: string, place: Place, overrides: Partial<FacilityRow> = {}): FacilityRow {
  return { id: `facility-${place.id}`, hotelId, placeId: place.id, status: "active", facilityType: "pool", place, ...overrides };
}

function build(input: Partial<BuildEligiblePlacesInput> & { hotelId: string }) {
  return buildEligiblePlaces({
    hotelPlaceId: input.hotelId === HOTEL_A ? HOTEL_A_PLACE : "hotel-b-place",
    facilities: [],
    contracts: [],
    attractions: [],
    partnerships: [],
    now: NOW,
    ...input,
  });
}

const ids = (input: Partial<BuildEligiblePlacesInput> & { hotelId: string }) => build(input).map((entry) => entry.place.id);

const cafe = makeTestPlace({ id: "cafe", category: "restaurant" });
const fortress = makeTestPlace({ id: "fortress", category: "landmark", kind: "attraction" });
const pool = makeTestPlace({ id: "pool", category: "spa" });

describe("Atlas contracts decide whether a business is in the catalogue", () => {
  test("an active, confirmed, in-window contract makes a business eligible for every hotel", () => {
    assert.deepEqual(ids({ hotelId: HOTEL_A, contracts: [contract(cafe)] }), ["cafe"]);
    assert.deepEqual(ids({ hotelId: HOTEL_B, contracts: [contract(cafe)] }), ["cafe"]);
  });

  test("pending, suspended and ended contracts are not eligible", () => {
    for (const status of ["pending_review", "suspended", "ended"] satisfies AtlasContractStatus[]) {
      assert.equal(isContractEligible(contract(cafe, { status }), NOW), false, status);
    }
  });

  test("an active contract without an explicit confirmation is not eligible", () => {
    assert.equal(isContractEligible(contract(cafe, { confirmedAt: null }), NOW), false);
  });

  test("the contract window is half-open: eligible from its start, not at its end", () => {
    assert.equal(isContractEligible(contract(cafe, { startsAt: NOW }), NOW), true);
    assert.equal(isContractEligible(contract(cafe, { startsAt: new Date(NOW.getTime() + 1) }), NOW), false);
    assert.equal(isContractEligible(contract(cafe, { endsAt: NOW }), NOW), false);
    assert.equal(isContractEligible(contract(cafe, { endsAt: new Date(NOW.getTime() + 1) }), NOW), true);
  });

  test("a contract on a Place that is not a business (attraction or hotel) does not count", () => {
    assert.equal(isContractEligible(contract(fortress), NOW), false);
    assert.equal(isContractEligible(contract(makeTestPlace({ id: "hotel-x", category: "hotel" })), NOW), false);
  });

  test("a contracted business that is draft, unverified or archived is not eligible", () => {
    const draft = makeTestPlace({ id: "draft", category: "restaurant", publicationStatus: "draft", publishedAt: null });
    const unverified = makeTestPlace({ id: "unverified", category: "restaurant", verificationStatus: "unverified", verifiedAt: null });
    const archived = makeTestPlace({ id: "archived", category: "restaurant", archivedAt: CONFIRMED, publicationStatus: "draft", publishedAt: null });
    assert.deepEqual(ids({ hotelId: HOTEL_A, contracts: [contract(draft), contract(unverified), contract(archived)] }), []);
  });
});

describe("attractions need no contract", () => {
  test("a published, verified attraction is eligible for every hotel with nothing else", () => {
    assert.deepEqual(ids({ hotelId: HOTEL_A, attractions: [fortress] }), ["fortress"]);
    assert.deepEqual(ids({ hotelId: HOTEL_B, attractions: [fortress] }), ["fortress"]);
  });

  test("a business passed as an attraction, or a draft attraction, is not eligible", () => {
    const draft = makeTestPlace({ id: "draft-fort", category: "landmark", kind: "attraction", publicationStatus: "draft", publishedAt: null });
    assert.deepEqual(ids({ hotelId: HOTEL_A, attractions: [cafe, draft] }), []);
  });
});

describe("facilities belong to their own hotel", () => {
  test("an active facility is eligible for its own hotel only", () => {
    assert.deepEqual(ids({ hotelId: HOTEL_A, facilities: [facility(HOTEL_A, pool)] }), ["pool"]);
    // Defence in depth: Hotel A's row leaked into Hotel B's input still yields nothing.
    assert.deepEqual(ids({ hotelId: HOTEL_B, facilities: [facility(HOTEL_A, pool)] }), []);
  });

  test("an inactive facility is not eligible", () => {
    assert.deepEqual(ids({ hotelId: HOTEL_A, facilities: [facility(HOTEL_A, pool, { status: "inactive" })] }), []);
  });

  test("a Place that is both the hotel's facility and contracted is reported once, as the facility", () => {
    const result = build({ hotelId: HOTEL_A, facilities: [facility(HOTEL_A, pool)], contracts: [contract(pool)] });
    assert.deepEqual(result.map((entry) => [entry.place.id, entry.source]), [["pool", "facility"]]);
  });
});

describe("hotels are never destinations", () => {
  test("another hotel's Place is dropped from every source, and so is the guest's own hotel", () => {
    const otherHotel = makeTestPlace({ id: "hotel-b-place", category: "hotel" });
    const ownHotel = makeTestPlace({ id: HOTEL_A_PLACE, category: "hotel" });
    const mislabelled = { ...otherHotel, kind: "attraction" as const };
    assert.deepEqual(
      ids({ hotelId: HOTEL_A, attractions: [mislabelled, ownHotel], contracts: [contract(otherHotel)], facilities: [facility(HOTEL_A, otherHotel)] }),
      []
    );
  });
});

describe("hotel partnerships only promote", () => {
  test("a partnership alone makes nothing visible", () => {
    assert.deepEqual(ids({ hotelId: HOTEL_A, partnerships: [partnership(HOTEL_A, cafe)] }), []);
  });

  test("a partnership promotes a contracted partner, for its own hotel only", () => {
    const rows = { contracts: [contract(cafe)], partnerships: [partnership(HOTEL_A, cafe)] };
    const [forA] = build({ hotelId: HOTEL_A, ...rows });
    const [forB] = build({ hotelId: HOTEL_B, ...rows });
    assert.deepEqual(forA.promotion, { partnershipId: "partnership-hotel-a-cafe", priority: 2, featured: true, offerText: "Free dessert" });
    assert.equal(forB.place.id, "cafe");
    assert.equal(forB.promotion, null);
  });

  test("a pending, suspended, revoked, unconfirmed or out-of-window partnership promotes nothing", () => {
    const lapsed: PartnershipRow[] = [
      partnership(HOTEL_A, cafe, { status: "pending_review", confirmedAt: null }),
      partnership(HOTEL_A, cafe, { status: "suspended" }),
      partnership(HOTEL_A, cafe, { status: "revoked" }),
      partnership(HOTEL_A, cafe, { confirmedAt: null }),
      partnership(HOTEL_A, cafe, { endsAt: NOW }),
      partnership(HOTEL_A, cafe, { startsAt: new Date(NOW.getTime() + 1) }),
    ];
    for (const row of lapsed) {
      assert.equal(isPartnershipEligible(row, HOTEL_A, NOW), false, JSON.stringify(row.status));
      const [entry] = build({ hotelId: HOTEL_A, contracts: [contract(cafe)], partnerships: [row] });
      assert.equal(entry.promotion, null);
    }
  });

  test("a partnership never promotes an attraction or a facility", () => {
    const result = build({
      hotelId: HOTEL_A,
      attractions: [fortress],
      facilities: [facility(HOTEL_A, pool)],
      partnerships: [partnership(HOTEL_A, fortress), partnership(HOTEL_A, pool)],
    });
    assert.equal(result.length, 2);
    assert.ok(result.every((entry) => entry.promotion === null));
  });

  test("a partnership for a Place whose contract lapsed makes nothing visible", () => {
    assert.deepEqual(ids({ hotelId: HOTEL_A, contracts: [contract(cafe, { status: "ended", endsAt: CONFIRMED })], partnerships: [partnership(HOTEL_A, cafe)] }), []);
  });
});

describe("sources", () => {
  test("each entry says why it is eligible, and relationId points at that reason", () => {
    const result = build({ hotelId: HOTEL_A, contracts: [contract(cafe)], attractions: [fortress], facilities: [facility(HOTEL_A, pool)] });
    assert.deepEqual(
      result.map((entry) => [entry.place.id, entry.source, entry.relationId]),
      [
        ["pool", "facility", "facility-pool"],
        ["fortress", "attraction", "fortress"],
        ["cafe", "partner", "contract-cafe"],
      ]
    );
  });

  test("with nothing eligible the result is empty: no substitutes", () => {
    const nearby = makeTestPlace({ id: "nearby", category: "restaurant" });
    assert.deepEqual(ids({ hotelId: HOTEL_A, partnerships: [partnership(HOTEL_A, nearby)] }), []);
  });
});

describe("filterEligibleByRadius", () => {
  test("narrows by distance and sorts nearest first; it can never add a Place", () => {
    const close = makeTestPlace({ id: "close", category: "restaurant", latitude: 41.7001, longitude: 44.8 });
    const far = makeTestPlace({ id: "far", category: "restaurant", latitude: 41.8, longitude: 44.8 });
    const eligible = build({ hotelId: HOTEL_A, contracts: [contract(far), contract(close)] });
    const filtered = filterEligibleByRadius(eligible, { lat: 41.7, lng: 44.8 }, 1_000);
    assert.deepEqual(filtered.map((entry) => entry.place.id), ["close"]);
    assert.deepEqual(filterEligibleByRadius(eligible, { lat: 41.7, lng: 44.8 }, 50_000).map((entry) => entry.place.id), ["close", "far"]);
  });
});
