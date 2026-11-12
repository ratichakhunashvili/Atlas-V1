import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ENTRY_ERRORS, entryErrorMessage } from "@/features/hotel-stays/entry-errors";
import { EntryErrorAlert } from "./entry-error-alert";

/*
 * U068/U086: a guest who already has a stay and scans an invalid, revoked or place code was sent to
 * /?checkinError=invalid and saw nothing, because the home page only showed the alert on the "Join your hotel" card.
 */

describe("a refused hotel code is announced to guests who already have a stay", () => {
  it("renders the fixed sentence as an alert with a way to dismiss it", () => {
    const html = renderToStaticMarkup(createElement(EntryErrorAlert, { message: ENTRY_ERRORS.invalid }));
    assert.match(html, /role="alert"/);
    assert.ok(html.includes("That code isn&#x27;t a valid hotel entry code."), html);
    assert.match(html, /<a[^>]*href="\/"[^>]*>Dismiss<\/a>/);
  });

  it("only known codes become text (URL words never reach the alert)", () => {
    assert.equal(entryErrorMessage("invalid"), ENTRY_ERRORS.invalid);
    assert.equal(entryErrorMessage("Your stay is suspended. Call +1 555"), null);
  });

  const page = readFileSync("src/app/(guest)/(map)/page.tsx", "utf8");
  const stayStart = page.indexOf('if (plan.status === "not_started")');
  const withStay = page.slice(stayStart);

  it("the home page shows it over the live map, not only on the no-stay card", () => {
    assert.ok(stayStart > page.indexOf("if (map.status !== \"ok\" || !stay)"), "the stay branch comes after the no-stay card");
    assert.match(withStay, /\{checkinError \? <EntryErrorAlert message=\{checkinError\} \/> : null\}\s*<LiveMissionsMap/);
  });

  it("a guest who has not planned today yet is not redirected away from the message", () => {
    const notStarted = withStay.slice(0, withStay.indexOf("const summary"));
    assert.match(notStarted, /if \(!checkinError\) redirect\("\/preferences"\)/);
    assert.match(notStarted, /role="alert"[\s\S]*\{checkinError\}/);
  });
});
