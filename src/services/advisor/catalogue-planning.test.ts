import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ItineraryDay, ItineraryStop, Place } from "@/db/schema";
import { buildEligiblePlaces, type ContractRow, type PartnershipRow } from "@/services/eligibility/rules";
import type { AdvisorCandidate } from "./candidates";
import { buildDailyChoices } from "./daily-choices";
import { PROMOTION_MAX_LIFT, rankCandidates } from "./scoring";
import { chooseStops } from "./stop-selection";
import { contextFromEligible, evaluatePendingStops, evaluateStopAvailability } from "./stop-availability";
import { makeTestPlace } from "./test-utils";

/*
 * Phase C4 (docs/catalogue-model-plan.md §4 and §9): plans and their repair follow the Atlas catalogue.
 * Candidates come from the whole catalogue through the eligibility boundary, a hotel promotion is a BOUNDED
 * boost, a 1-of-3 holds at most one promoted option, nothing is ever substituted, and revalidation uses the
 * catalogue's causes (a lapsed contract, not a lost partnership).
 */

const NOW = new Date("2026-06-15T12:00:00Z");
const HOTEL_A = "hotel-a";
const HOTEL_B = "hotel-b";
const HOTEL = { lat: 41.7, lng: 44.8 };
const hotelPlace = makeTestPlace({ id: "hotel-a-place", category: "hotel", latitude: HOTEL.lat, longitude: HOTEL.lng });

// ~111 m per 0.001° of latitude.
const near = (id: string, n: number, extra: Partial<Place> = {}) =>
  makeTestPlace({ id, name: id, category: "restaurant", latitude: HOTEL.lat + n * 0.001, longitude: HOTEL.lng, visitDurationMinutes: 30, ...extra });

const contract = (place: Place, extra: Partial<ContractRow> = {}): ContractRow => ({
  id: `contract-${place.id}`,
  placeId: place.id,
  status: "active",
  startsAt: null,
  endsAt: null,
  confirmedAt: new Date("2026-01-01T00:00:00Z"),
  place,
  ...extra,
});

const partnership = (place: Place, hotelId: string, extra: Partial<PartnershipRow> = {}): PartnershipRow => ({
  id: `partnership-${hotelId}-${place.id}`,
  hotelId,
  placeId: place.id,
  status: "active",
  startsAt: null,
  endsAt: null,
  confirmedAt: new Date("2026-01-01T00:00:00Z"),
  priority: null,
  featured: false,
  offerText: null,
  place,
  ...extra,
});

function catalogueFor(
  hotelId: string,
  rows: { contracts?: ContractRow[]; attractions?: Place[]; partnerships?: PartnershipRow[] }
) {
  return buildEligiblePlaces({
    hotelId,
    hotelPlaceId: hotelPlace.id,
    facilities: [],
    contracts: rows.contracts ?? [],
    attractions: rows.attractions ?? [],
    partnerships: rows.partnerships ?? [],
    now: NOW,
  });
}

function choicesFrom(eligiblePlaces: ReturnType<typeof catalogueFor>, categories: Place["category"][] = ["restaurant", "landmark"]) {
  return buildDailyChoices({
    eligiblePlaces,
    hotelPlaceId: hotelPlace.id,
    hotelLocation: HOTEL,
    origin: HOTEL,
    categories,
    budget: null,
    preferredMaxDistanceMeters: null,
    excludePlaceIds: new Set(),
    remainingMinutes: 180,
    usageHistory: new Map(),
  });
}

const candidate = (id: string, distanceMeters: number, promotion?: { priority: number | null }): AdvisorCandidate => ({
  place: makeTestPlace({ id, category: "restaurant" }),
  distanceMeters,
  source: "partner",
  isPartner: promotion !== undefined,
  partnerPriority: promotion?.priority ?? null,
});

describe("C4: plan candidates come from the whole catalogue", () => {
  it("offers an Atlas partner with no partnership with this hotel, and an attraction, to this hotel's guests", () => {
    const cafe = near("contracted-cafe", 2);
    const fortress = near("fortress", 3, { category: "landmark", kind: "attraction" });
    const choices = choicesFrom(catalogueFor(HOTEL_A, { contracts: [contract(cafe)], attractions: [fortress] }));
    assert.deepEqual(choices.map((choice) => choice.placeId).sort(), ["contracted-cafe", "fortress"]);
    assert.ok(choices.every((choice) => choice.featured === false && choice.offerText === null));
  });

  it("never offers a business whose contract is pending, suspended, ended or expired, even with a hotel partnership", () => {
    const places = ["pending", "suspended", "ended", "expired"].map((id, index) => near(id, index + 1));
    const contracts = [
      contract(places[0], { status: "pending_review", confirmedAt: null }),
      contract(places[1], { status: "suspended" }),
      contract(places[2], { status: "ended" }),
      contract(places[3], { endsAt: new Date("2026-06-01T00:00:00Z") }),
    ];
    const partnerships = places.map((place) => partnership(place, HOTEL_A, { featured: true }));
    assert.deepEqual(choicesFrom(catalogueFor(HOTEL_A, { contracts, partnerships })), []);
  });

  it("with nothing eligible offers nothing: no substitutes, and generated plans may have fewer stops (§9.12)", () => {
    assert.deepEqual(choicesFrom(catalogueFor(HOTEL_A, {})), []);
    const one = catalogueFor(HOTEL_A, { contracts: [contract(near("only-one", 1))] });
    assert.equal(choicesFrom(one).length, 1);
    const pool = [candidate("only-one", 100)];
    assert.equal(chooseStops({ candidates: pool, usageHistory: new Map(), targetCount: 4 }).length, 1);
  });

  it("promotes a partner only for the hotel that partnered with it", () => {
    const cafe = near("cafe", 1);
    const rows = { contracts: [contract(cafe)], partnerships: [partnership(cafe, HOTEL_A, { featured: true, offerText: "10% off" })] };
    assert.equal(choicesFrom(catalogueFor(HOTEL_A, rows))[0].featured, true);
    const forB = choicesFrom(catalogueFor(HOTEL_B, rows));
    assert.equal(forB[0].placeId, "cafe", "Hotel B's guests still see the Atlas partner");
    assert.equal(forB[0].featured, false);
    assert.equal(forB[0].offerText, null);
  });
});

describe("C4: the promotion boost is bounded (§9.14)", () => {
  it(`lifts a prioritised promotion at most ${PROMOTION_MAX_LIFT} places above its fit`, () => {
    const fits = [0, 1, 2, 3, 4].map((n) => candidate(`fit-${n}`, 100 + n * 100));
    const promoted = candidate("promoted", 5000, { priority: 1 }); // the worst fit of all
    const ranked = rankCandidates([promoted, ...fits], new Map()).map((c) => c.place.id);
    assert.equal(ranked.indexOf("promoted"), 5 - PROMOTION_MAX_LIFT);
    assert.deepEqual(ranked.slice(0, 5 - PROMOTION_MAX_LIFT), ["fit-0", "fit-1", "fit-2"]);
  });

  it("does not lift a promotion without a priority at all", () => {
    const ranked = rankCandidates([candidate("promoted", 900, { priority: null }), candidate("closer", 100)], new Map());
    assert.deepEqual(ranked.map((c) => c.place.id), ["closer", "promoted"]);
  });

  it("a promotion never beats a better spending-tier fit beyond the cap", () => {
    const cheap = [1, 2, 3].map((n) => ({ ...candidate(`cheap-${n}`, n * 100), place: makeTestPlace({ id: `cheap-${n}`, category: "restaurant", priceLevel: 1 }) }));
    const pricey = { ...candidate("pricey-promoted", 10, { priority: 1 }), place: makeTestPlace({ id: "pricey-promoted", category: "restaurant", priceLevel: 4 }) };
    const ranked = rankCandidates([pricey, ...cheap], new Map(), { budget: "budget" }).map((c) => c.place.id);
    assert.equal(ranked[0], "cheap-1", "the best fit keeps first place");
  });
});

describe("C4: at most one promoted option in a 1-of-3 (decision 4)", () => {
  it("fills the other two slots with unpromoted places, even when more promoted ones rank higher", () => {
    const promotedPlaces = [1, 2, 3].map((n) => near(`promoted-${n}`, n));
    const plain = [7, 8].map((n) => near(`plain-${n}`, n));
    const eligible = catalogueFor(HOTEL_A, {
      contracts: [...promotedPlaces, ...plain].map((place) => contract(place)),
      partnerships: promotedPlaces.map((place, index) => partnership(place, HOTEL_A, { priority: index + 1 })),
    });
    const choices = choicesFrom(eligible);
    assert.equal(choices.length, 3);
    assert.equal(choices.filter((choice) => choice.placeId.startsWith("promoted")).length, 1);
    assert.deepEqual(choices.slice(1).map((choice) => choice.placeId), ["plain-7", "plain-8"]);
  });

  it("gives the featured partner the promoted slot over a better-ranked promoted one", () => {
    const top = near("promoted-top", 1);
    const featured = near("promoted-featured", 5);
    const eligible = catalogueFor(HOTEL_A, {
      contracts: [contract(top), contract(featured), contract(near("plain", 2)), contract(near("plain-2", 3))],
      partnerships: [partnership(top, HOTEL_A, { priority: 1 }), partnership(featured, HOTEL_A, { featured: true })],
    });
    const ids = choicesFrom(eligible).map((choice) => choice.placeId);
    assert.equal(ids[0], "promoted-featured");
    assert.ok(!ids.includes("promoted-top"));
  });

  it("offers a second promoted place only when no unpromoted place is left to fill the slot", () => {
    const promotedPlaces = [1, 2].map((n) => near(`promoted-${n}`, n));
    const eligible = catalogueFor(HOTEL_A, {
      contracts: promotedPlaces.map((place) => contract(place)),
      partnerships: promotedPlaces.map((place) => partnership(place, HOTEL_A)),
    });
    assert.equal(choicesFrom(eligible).length, 2);
  });
});

describe("C4: revalidation follows the catalogue's causes (§9.13)", () => {
  const stay = { id: "stay-1", hotel: { id: HOTEL_A }, checkIn: new Date("2026-06-15T08:00:00Z"), checkOut: null };
  const day: Pick<ItineraryDay, "hotelId" | "hotelStayId" | "dayNumber"> = { hotelId: HOTEL_A, hotelStayId: "stay-1", dayNumber: 1 };
  const cafe = near("cafe", 1);
  const stopFor = (placeId: string | null, visitedAt: Date | null = null) =>
    ({ id: `stop-${placeId}`, placeId, visitedAt, supersededAt: null }) as ItineraryStop;

  it("losing the hotel partnership keeps a planned stop available (only the promotion goes)", () => {
    const before = catalogueFor(HOTEL_A, { contracts: [contract(cafe)], partnerships: [partnership(cafe, HOTEL_A)] });
    const after = catalogueFor(HOTEL_A, { contracts: [contract(cafe)], partnerships: [partnership(cafe, HOTEL_A, { status: "revoked" })] });
    assert.notEqual(before[0].promotion, null);
    assert.equal(after[0].promotion, null);
    assert.deepEqual(evaluateStopAvailability(stopFor("cafe"), day, contextFromEligible(stay, after, NOW)), { available: true });
  });

  it("losing the Atlas contract makes the stop unavailable, while a visited stop stays history", () => {
    const lapsed = catalogueFor(HOTEL_A, { contracts: [contract(cafe, { status: "ended" })], partnerships: [partnership(cafe, HOTEL_A)] });
    const context = contextFromEligible(stay, lapsed, NOW);
    assert.deepEqual(evaluateStopAvailability(stopFor("cafe"), day, context), { available: false, reason: "not_eligible" });

    const visited = stopFor("cafe", new Date("2026-06-15T10:00:00Z"));
    const pending = { ...stopFor("cafe"), id: "pending" } as ItineraryStop;
    const result = evaluatePendingStops([visited, pending], day, context);
    assert.equal(result.has(visited.id), false, "a completed stop is never re-evaluated, so its history stays readable");
    assert.equal(result.get("pending")?.available, false);
  });

  it("an attraction stays available without any contract or partnership; unpublishing it makes it unavailable", () => {
    const fortress = near("fortress", 2, { category: "landmark", kind: "attraction" });
    const live = contextFromEligible(stay, catalogueFor(HOTEL_A, { attractions: [fortress] }), NOW);
    assert.equal(evaluateStopAvailability(stopFor("fortress"), day, live).available, true);
    const unpublished = { ...fortress, publicationStatus: "draft" as const };
    const gone = contextFromEligible(stay, catalogueFor(HOTEL_A, { attractions: [unpublished] }), NOW);
    assert.equal(evaluateStopAvailability(stopFor("fortress"), day, gone).available, false);
  });
});
