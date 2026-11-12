import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ENTRY_ERRORS, entryErrorCode, entryErrorMessage, entryErrorPath } from "./entry-errors";

describe("hotel entry error codes", () => {
  it("maps every known message to its code and back", () => {
    for (const [code, message] of Object.entries(ENTRY_ERRORS)) {
      assert.equal(entryErrorCode(message), code);
      assert.equal(entryErrorMessage(code), message);
    }
  });

  it("never echoes text from the URL", () => {
    assert.equal(entryErrorMessage("Your stay is suspended. Call +1 555 0100 to pay a fee."), null);
    assert.equal(entryErrorMessage(ENTRY_ERRORS.invalid), null, "the sentence itself is not a code");
    assert.equal(entryErrorMessage("__proto__"), null);
    assert.equal(entryErrorMessage("constructor"), null);
    assert.equal(entryErrorMessage(["invalid"]), null);
    assert.equal(entryErrorMessage(undefined), null);
  });

  it("sends unknown messages to the generic code, in the URL as a code only", () => {
    assert.equal(entryErrorPath("something unexpected"), "/?checkinError=unavailable");
    assert.equal(entryErrorPath(ENTRY_ERRORS.expired), "/?checkinError=expired");
  });

  it("is the only way the home screen and the entry routes use checkinError", () => {
    const home = readFileSync("src/app/(guest)/(map)/page.tsx", "utf8");
    assert.match(home, /entryErrorMessage\(/);
    for (const file of [
      "src/features/hotel-stays/actions.ts",
      "src/app/(app)/checkin/[token]/page.tsx",
      "src/app/(app)/checkin/confirm/page.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /checkinError=\$\{encodeURIComponent/, `${file} must not put message text in the URL`);
      assert.doesNotMatch(source, /checkinError=That/, `${file} must not put message text in the URL`);
    }
  });
});
