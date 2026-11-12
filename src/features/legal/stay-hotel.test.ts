import { test } from "node:test";
import assert from "node:assert/strict";
import { hotelLabel, validStayHotelName } from "./stay-hotel";

const now = new Date("2026-11-10T12:00:00Z");
const day = (d: number) => new Date(now.getTime() + d * 86_400_000);

test("no stay: no hotel name", () => {
  assert.equal(validStayHotelName(null, now), null);
  assert.equal(hotelLabel(null), "your hotel");
});

test("a current stay names its hotel", () => {
  assert.equal(validStayHotelName({ checkOut: null, expectedCheckOut: day(2), hotelName: "Hotel X" }, now), "Hotel X");
  assert.equal(validStayHotelName({ checkOut: null, expectedCheckOut: null, hotelName: " Hotel X " }, now), "Hotel X");
  assert.equal(hotelLabel("Hotel X"), "Hotel X");
});

test("an ended stay names no hotel", () => {
  assert.equal(validStayHotelName({ checkOut: day(-1), expectedCheckOut: day(-1), hotelName: "Hotel X" }, now), null);
  assert.equal(validStayHotelName({ checkOut: null, expectedCheckOut: day(-1), hotelName: "Hotel X" }, now), null);
  assert.equal(validStayHotelName({ checkOut: null, expectedCheckOut: now, hotelName: "Hotel X" }, now), null);
});

test("a blank hotel name falls back to neutral wording", () => {
  assert.equal(validStayHotelName({ checkOut: null, expectedCheckOut: null, hotelName: "  " }, now), null);
});
