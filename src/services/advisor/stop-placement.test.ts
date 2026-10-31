import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { placeHotelActivities } from "./stop-placement";

const middle = ["partner-1", "partner-2", "partner-3"];

describe("pinning the hotel's own activities to the ends of the day", () => {
  it("leaves an ordinary day alone", () => {
    assert.deepEqual(placeHotelActivities({ middle, facility: null, event: null }), middle);
  });

  it("puts a facility first on an odd day", () => {
    const result = placeHotelActivities({ middle, facility: { stop: "spa", placement: "first" }, event: null });
    assert.deepEqual(result, ["spa", ...middle]);
  });

  it("puts a facility last on an even day", () => {
    const result = placeHotelActivities({ middle, facility: { stop: "spa", placement: "last" }, event: null });
    assert.deepEqual(result, [...middle, "spa"]);
  });

  it("never puts a hotel activity in the middle, which would mean walking home and out again", () => {
    for (const placement of ["first", "last"] as const) {
      const result = placeHotelActivities({ middle, facility: { stop: "spa", placement }, event: null });
      const position = result.indexOf("spa");
      assert.ok(position === 0 || position === result.length - 1);
    }
  });

  it("gives the event the end its schedule requires and moves the facility to the other", () => {
    const result = placeHotelActivities({
      middle,
      facility: { stop: "spa", placement: "last" },
      event: { stop: "tasting", placement: "last" },
    });

    assert.equal(result[result.length - 1], "tasting", "the event keeps the end it needs");
    assert.equal(result[0], "spa", "the facility takes the other end rather than being dropped");
    assert.equal(result.length, middle.length + 2, "nothing is lost in the shuffle");
  });

  it("keeps both at their own ends when they do not collide", () => {
    const result = placeHotelActivities({
      middle,
      facility: { stop: "spa", placement: "last" },
      event: { stop: "tasting", placement: "first" },
    });

    assert.deepEqual(result, ["tasting", ...middle, "spa"]);
  });

  it("works with nothing in the middle", () => {
    const result = placeHotelActivities({
      middle: [],
      facility: { stop: "spa", placement: "first" },
      event: { stop: "tasting", placement: "last" },
    });

    assert.deepEqual(result, ["spa", "tasting"]);
  });

  it("never adds, drops or substitutes a stop", () => {
    const result = placeHotelActivities({
      middle,
      facility: { stop: "spa", placement: "first" },
      event: { stop: "tasting", placement: "last" },
    });

    assert.deepEqual([...result].sort(), [...middle, "spa", "tasting"].sort());
  });
});
