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
