import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Place } from "@/db/schema";
import { buildEligiblePlaces, type ContractRow, type FacilityRow, type PartnershipRow } from "@/services/eligibility/rules";
import { makeTestPlace } from "@/services/advisor/test-utils";
import { isVenueEligibleForEvent, lastMomentOf } from "./venue";

/**
 * An event at an external venue is rejected if the venue is not in the Atlas catalogue at event time (its Atlas
 * contract, under the catalogue rule). The venue check is built from the real eligibility rules, evaluated at the
 * event's own start and end.
 */

const HOTEL = "hotel-a";
const hotelPlace = makeTestPlace({ id: "hotel-place", category: "hotel" });
const venue = makeTestPlace({ id: "venue", category: "restaurant" });

const T = (iso: string) => new Date(iso);
const eventStart = T("2026-11-10T18:00:00Z");
const eventEnd = T("2026-11-10T21:00:00Z");

function contract(overrides: Partial<ContractRow> = {}, place: Place = venue): ContractRow {
  return {
    id: "c-1",
    placeId: place.id,
    status: "active",
    startsAt: null,
    endsAt: null,
    confirmedAt: T("2026-01-01T00:00:00Z"),
    place,
    ...overrides,
  };
}

function check(contracts: ContractRow[], facilities: FacilityRow[] = [], partnerships: PartnershipRow[] = [], hotelId = HOTEL) {
  const at = (now: Date) =>
    buildEligiblePlaces({ hotelId, hotelPlaceId: hotelPlace.id, facilities, contracts, attractions: [], partnerships, now });
  return isVenueEligibleForEvent({
    venuePlaceId: venue.id,
    eligibleAtStart: at(eventStart),
    eligibleAtEnd: at(lastMomentOf({ endsAt: eventEnd })),
  });
}

describe("an event venue must be eligible at the event's time", () => {
  it("accepts an active, open-ended Atlas contract", () => {
    assert.equal(check([contract()]), true);
  });

  it("accepts a contract whose window covers the whole event, even one that does not cover today", () => {
    assert.equal(check([contract({ startsAt: T("2026-11-01T00:00:00Z"), endsAt: T("2026-12-01T00:00:00Z") })]), true);
  });

  it("rejects a contract that has expired by the time of the event, though it is active today", () => {
    assert.equal(check([contract({ endsAt: T("2026-11-05T00:00:00Z") })]), false);
  });

  it("rejects a contract that has not started by the event", () => {
    assert.equal(check([contract({ startsAt: T("2026-12-01T00:00:00Z") })]), false);
  });

  it("rejects a contract that ends in the middle of the event", () => {
    assert.equal(check([contract({ endsAt: T("2026-11-10T19:30:00Z") })]), false);
  });

  it("accepts a window ending exactly when the event ends (the window is half-open)", () => {
    assert.equal(check([contract({ endsAt: eventEnd })]), true);
  });

  it("rejects pending, suspended and ended contracts", () => {
    for (const status of ["pending_review", "suspended", "ended"] as const) {
      assert.equal(check([contract({ status })]), false, status);
    }
  });

  it("rejects a venue that only has a hotel partnership: a partnership promotes, it never makes a Place eligible", () => {
    const partnership: PartnershipRow = {
      id: "p-1",
      hotelId: HOTEL,
      placeId: venue.id,
      status: "active",
      startsAt: null,
      endsAt: null,
      confirmedAt: T("2026-01-01T00:00:00Z"),
      priority: null,
      featured: true,
      offerText: null,
      place: venue,
    };
    assert.equal(check([], [], [partnership]), false);
  });

  it("rejects a venue that is not published and verified at all", () => {
    const draft = makeTestPlace({ id: "venue", category: "restaurant", publicationStatus: "draft", publishedAt: null });
    assert.equal(check([contract({}, draft)]), false);
  });

  it("accepts the hotel's own active facility with no Atlas contract", () => {
    const facility: FacilityRow = { id: "f-1", hotelId: HOTEL, placeId: venue.id, status: "active", facilityType: "spa", place: venue };
    assert.equal(check([], [facility]), true);
  });

  it("rejects a Place with no contract, however nearby", () => {
    assert.equal(check([]), false);
  });
});
