import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeStay, initialFor } from "./guest-profile";

const checkIn = new Date("2026-03-10T10:00:00Z");
const expectedCheckOut = new Date("2026-03-13T08:00:00Z");

describe("describeStay", () => {
  it("counts the current night", () => {
    assert.equal(describeStay({ checkIn, expectedCheckOut, checkOut: null, now: new Date("2026-03-11T15:00:00Z") }).progress, "Night 2 of 3");
  });
  it("says the stay ended once checked out", () => {
    assert.equal(describeStay({ checkIn, expectedCheckOut, checkOut: new Date("2026-03-12T08:00:00Z"), now: new Date("2026-03-12T09:00:00Z") }).progress, "Stay ended");
  });
  it("says the stay ended after the expected check-out", () => {
    assert.equal(describeStay({ checkIn, expectedCheckOut, checkOut: null, now: new Date("2026-03-14T09:00:00Z") }).progress, "Stay ended");
  });
  it("formats the dates in Tbilisi time", () => {
    assert.equal(describeStay({ checkIn, expectedCheckOut, checkOut: null, now: checkIn }).dates, "10 Mar – 13 Mar");
  });
});

describe("initialFor", () => {
  it("uses the name, then the email", () => {
    assert.equal(initialFor("nino", "x@y.z"), "N");
    assert.equal(initialFor(null, "guest@atlas.test"), "G");
    assert.equal(initialFor("  ", "anna@x.y"), "A");
  });
});
