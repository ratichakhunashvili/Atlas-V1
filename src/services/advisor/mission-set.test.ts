import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summariseMissionSet } from "./mission-set";

const stops = (...entries: Array<[string | null, boolean]>) => entries.map(([placeId, visited]) => ({ placeId, visited }));

describe("a mission set needs a hotel-owned activity", () => {
  it("is valid when one stop is the hotel's own eligible facility", () => {
    const summary = summariseMissionSet({
      stops: stops(["cafe", false], ["spa", true]),
      eligibleFacilityPlaceIds: new Set(["spa"]),
    });
    assert.deepEqual(summary, { total: 2, completed: 1, hasHotelActivity: true, gap: null, valid: true });
  });

  it("is incomplete — and says the hotel has none — when it has configured no facility", () => {
    const summary = summariseMissionSet({ stops: stops(["cafe", false]), eligibleFacilityPlaceIds: new Set() });
    assert.equal(summary.valid, false);
    assert.equal(summary.gap?.reason, "no_hotel_activities_configured");
    assert.match(summary.gap?.message ?? "", /hasn't set up any of its own activities/);
  });

  it("is incomplete — and says none fit — when facilities exist but none made it into the plan", () => {
    const summary = summariseMissionSet({ stops: stops(["cafe", false]), eligibleFacilityPlaceIds: new Set(["sauna"]) });
    assert.equal(summary.valid, false);
    assert.equal(summary.gap?.reason, "none_fit_this_plan");
  });

  it("never treats an external partner as a hotel-owned activity", () => {
    // "partner-cafe" is eligible to the hotel, but only FACILITY ids are passed in: a partner can never satisfy the rule.
    const summary = summariseMissionSet({ stops: stops(["partner-cafe", true]), eligibleFacilityPlaceIds: new Set(["spa"]) });
    assert.equal(summary.hasHotelActivity, false);
    assert.equal(summary.valid, false);
  });

  it("ignores a stop whose Place has been removed", () => {
    const summary = summariseMissionSet({ stops: stops([null, false]), eligibleFacilityPlaceIds: new Set(["spa"]) });
    assert.equal(summary.hasHotelActivity, false);
  });

  it("an empty plan is an invalid set with nothing to count", () => {
    const summary = summariseMissionSet({ stops: [], eligibleFacilityPlaceIds: new Set(["spa"]) });
    assert.deepEqual([summary.total, summary.completed, summary.valid], [0, 0, false]);
  });
});
