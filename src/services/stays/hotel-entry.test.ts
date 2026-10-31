import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideHotelEntry } from "./hotel-entry";

const HOTEL_A = { hotelId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", hotelName: "Hotel A" };
const HOTEL_B_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("what scanning a hotel-entry QR should do", () => {
  it("starts a stay when the guest has none", () => {
    assert.deepEqual(decideHotelEntry(null, HOTEL_A.hotelId), { action: "create_stay" });
  });

  it("does nothing when the guest is already staying at that exact hotel", () => {
    assert.deepEqual(decideHotelEntry(HOTEL_A, HOTEL_A.hotelId), { action: "already_here" });
  });

  it("asks before moving a guest who is staying somewhere else", () => {
    const decision = decideHotelEntry(HOTEL_A, HOTEL_B_ID);
    assert.equal(decision.action, "switch_required");
    assert.equal(decision.action === "switch_required" && decision.from.hotelName, "Hotel A");
  });

  it("never silently reports the OLD hotel as success — the previous behaviour this replaces", () => {
    const decision = decideHotelEntry(HOTEL_A, HOTEL_B_ID);
    assert.notEqual(decision.action, "already_here");
  });
});
