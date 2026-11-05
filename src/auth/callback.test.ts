import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { callbackQuery, safeCallback } from "./callback";

describe("the after-sign-in destination", () => {
  it("keeps a same-site path such as a scanned hotel code", () => {
    assert.equal(safeCallback("/checkin/abc", "/"), "/checkin/abc");
    assert.equal(callbackQuery("/checkin/abc"), "?callbackUrl=%2Fcheckin%2Fabc");
  });

  it("never sends anyone off-site", () => {
    assert.equal(safeCallback("//evil.example", "/"), "/");
    assert.equal(safeCallback("https://evil.example", "/"), "/");
    assert.equal(safeCallback(null, "/"), "/");
    assert.equal(callbackQuery("//evil.example"), "");
    assert.equal(callbackQuery(undefined), "");
  });
});
