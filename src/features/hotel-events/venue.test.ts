import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Place } from "@/db/schema";
import { buildEligiblePlaces, type FacilityRow, type PartnershipRow } from "@/services/eligibility/rules";
import { makeTestPlace } from "@/services/advisor/test-utils";
import { isVenueEligibleForEvent, lastMomentOf } from "./venue";

/**
 * "An event at an external venue is rejected if its hotel relationship is not active at event time." The venue check
 * is built from the real eligibility rules, evaluated at the event's own start and end.
 */

const HOTEL = "hotel-a";
const OTHER_HOTEL = "hotel-b";
const hotelPlace = makeTestPlace({ id: "hotel-place", category: "hotel" });
const venue = makeTestPlace({ id: "venue", category: "restaurant" });

const T = (iso: string) => new Date(iso);
const eventStart = T("2026-11-10T18:00:00Z");
const eventEnd = T("2026-11-10T21:00:00Z");

function partnership(overrides: Partial<PartnershipRow> = {}, place: Place = venue): PartnershipRow {
  return {
    id: "p-1",
    hotelId: HOTEL,
    placeId: place.id,
    status: "active",
    startsAt: null,
    endsAt: null,
    confirmedAt: T("2026-01-01T00:00:00Z"),
    priority: null,
    featured: false,
    offerText: null,
    place,
    ...overrides,
  };
}

function check(partnerships: PartnershipRow[], facilities: FacilityRow[] = [], hotelId = HOTEL) {
  const at = (now: Date) => buildEligiblePlaces({ hotelId, hotelPlaceId: hotelPlace.id, partnerships, facilities, now });
  return isVenueEligibleForEvent({
    venuePlaceId: venue.id,
    eligibleAtStart: at(eventStart),
    eligibleAtEnd: at(lastMomentOf({ endsAt: eventEnd })),
  });
}

describe("an event venue must be eligible at the event's time", () => {
  it("accepts an active, open-ended partnership", () => {
    assert.equal(check([partnership()]), true);
  });

  it("accepts a partnership whose window covers the whole event, even one that does not cover today", () => {
    assert.equal(check([partnership({ startsAt: T("2026-11-01T00:00:00Z"), endsAt: T("2026-12-01T00:00:00Z") })]), true);
  });

  it("rejects a partnership that has expired by the time of the event, though it is active today", () => {
    assert.equal(check([partnership({ endsAt: T("2026-11-05T00:00:00Z") })]), false);
  });

  it("rejects a partnership that has not started by the event", () => {
    assert.equal(check([partnership({ startsAt: T("2026-12-01T00:00:00Z") })]), false);
  });

  it("rejects a partnership that ends in the middle of the event", () => {
    assert.equal(check([partnership({ endsAt: T("2026-11-10T19:30:00Z") })]), false);
  });

  it("accepts a window ending exactly when the event ends (the window is half-open)", () => {
    assert.equal(check([partnership({ endsAt: eventEnd })]), true);
  });

  it("rejects pending, suspended and revoked relationships", () => {
    for (const status of ["pending_review", "suspended", "revoked"] as const) {
      assert.equal(check([partnership({ status })]), false, status);
    }
  });

  it("rejects a partnership with a DIFFERENT hotel: Hotel A's event cannot use Hotel B's partner", () => {
    assert.equal(check([partnership({ hotelId: OTHER_HOTEL })]), false);
  });

  it("rejects a venue that is not published and verified at all", () => {
    const draft = makeTestPlace({ id: "venue", category: "restaurant", publicationStatus: "draft", publishedAt: null });
    assert.equal(check([partnership({}, draft)]), false);
  });

  it("accepts the hotel's own active facility with no external partnership", () => {
    const facility: FacilityRow = { id: "f-1", hotelId: HOTEL, placeId: venue.id, status: "active", facilityType: "spa", place: venue };
    assert.equal(check([], [facility]), true);
  });

  it("rejects a Place with no relationship to the hotel, however nearby", () => {
    assert.equal(check([]), false);
  });
});
