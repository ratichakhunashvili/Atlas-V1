import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { callbackQuery, hasProtectedCallback, safeCallback } from "./callback";

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

  it("keeps the query string of a same-site deep link", () => {
    assert.equal(safeCallback("/admin/analytics?days=7", "/admin"), "/admin/analytics?days=7");
    assert.equal(safeCallback("/plan?day=2&stop=a%20b", "/"), "/plan?day=2&stop=a%20b");
    assert.equal(safeCallback("/", "/x"), "/");
    assert.equal(callbackQuery("/admin/analytics?days=7"), "?callbackUrl=%2Fadmin%2Fanalytics%3Fdays%3D7");
  });

  it("rejects backslash, encoded and control-character disguises of another site", () => {
    for (const unsafe of [
      "/\\evil.example",
      "/\\/evil.example",
      "/%5Cevil.example",
      "/%5cevil.example",
      "/%2F%2Fevil.example",
      "/%2f/evil.example",
      "/\t/evil.example",
      "/\n/evil.example",
      "/%09/evil.example",
      "/%0A/evil.example",
      "/profile\r\nSet-Cookie: x=y",
      "/%E0%A4%A",
      "https:/evil.example",
      "javascript:alert(1)",
      "",
    ]) {
      assert.equal(safeCallback(unsafe, "/"), "/", JSON.stringify(unsafe));
      assert.equal(callbackQuery(unsafe), "", JSON.stringify(unsafe));
    }
  });
});

describe("explaining a redirect to sign in", () => {
  it("is true for a protected page and false for none, the home page or an off-site link", () => {
    assert.equal(hasProtectedCallback("/profile"), true);
    assert.equal(hasProtectedCallback("/checkin/abc"), true);
    assert.equal(hasProtectedCallback("/"), false);
    assert.equal(hasProtectedCallback(undefined), false);
    assert.equal(hasProtectedCallback("//evil.example"), false);
  });
});
