import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTestHotelPickerAllowed, parseTestHotelPickerEmails } from "./test-hotel-picker";

describe("test hotel picker allow-list", () => {
  it("lets nobody in when the setting is unset or empty", () => {
    assert.equal(isTestHotelPickerAllowed("a@b.ge", undefined), false);
    assert.equal(isTestHotelPickerAllowed("a@b.ge", ""), false);
    assert.equal(isTestHotelPickerAllowed("a@b.ge", " , ,"), false);
  });
  it("matches listed emails, ignoring case and spaces", () => {
    assert.equal(isTestHotelPickerAllowed("A@B.ge", " x@y.ge , a@b.GE "), true);
    assert.equal(isTestHotelPickerAllowed("c@b.ge", "x@y.ge,a@b.ge"), false);
  });
  it("never matches a missing email or a partial address", () => {
    assert.equal(isTestHotelPickerAllowed(null, "a@b.ge"), false);
    assert.equal(isTestHotelPickerAllowed("b.ge", "a@b.ge"), false);
    assert.equal(parseTestHotelPickerEmails("a@b.ge,a@b.ge").size, 1);
  });
});

describe("open join", () => {
  it("is exactly the Skillwill test hotel", async () => {
    const { SKILLWILL_TEST_IDS } = await import("@/db/operations/skillwill-test");
    const { OPEN_JOIN_HOTEL_IDS, isOpenJoinHotel } = await import("./test-hotel-picker");
    assert.deepEqual(OPEN_JOIN_HOTEL_IDS, [SKILLWILL_TEST_IDS.hotel]);
    assert.equal(isOpenJoinHotel("5c111000-0000-4000-8000-000000000001"), false);
  });
});
