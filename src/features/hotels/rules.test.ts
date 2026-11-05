import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateHotelPlaceCandidate } from "./rules";

const clean = {
  place: { archivedAt: null },
  belongsToAnotherHotel: false,
  isHotelFacility: false,
  hasPartnershipRows: false,
  hasLiveContract: false,
};

describe("which place can be a hotel's own place", () => {
  it("accepts a place that is nothing else in the catalogue yet", () => {
    assert.equal(validateHotelPlaceCandidate(clean), null);
  });

  it("refuses another hotel's place, a facility, a partner, a contracted business and an archived place", () => {
    assert.match(validateHotelPlaceCandidate({ ...clean, belongsToAnotherHotel: true }) ?? "", /another hotel/);
    assert.match(validateHotelPlaceCandidate({ ...clean, isHotelFacility: true }) ?? "", /facility/);
    assert.match(validateHotelPlaceCandidate({ ...clean, hasPartnershipRows: true }) ?? "", /partnership/);
    assert.match(validateHotelPlaceCandidate({ ...clean, hasLiveContract: true }) ?? "", /contract/);
    assert.match(validateHotelPlaceCandidate({ ...clean, place: { archivedAt: new Date() } }) ?? "", /archived/);
  });
});
