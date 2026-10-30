import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { DEV_FIXTURE_EMAILS, DEV_FIXTURE_IDS } from "@/db/operations/dev-seed";
import { TEST_ENTRY_FIXTURES } from "@/services/deployment/test-fixtures";

/**
 * The no-QR test entry is the one door around hotel QR entry, so its boundaries are pinned as structure as well as
 * behaviour (the decision logic itself is tested in services/deployment/environment.test.ts).
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("test entry cannot be steered from the browser", () => {
  const actions = stripComments(read("src/features/test-entry/actions.ts"));
  const offer = stripComments(read("src/features/test-entry/offer.ts"));

  it("takes no form field, query value or argument that could name a hotel, account or flag", () => {
    assert.doesNotMatch(actions, /formData|searchParams|request\.|headers\(|cookies\(/);
    assert.match(actions, /export async function enterTestStayFormAction\(\)/, "the action takes no arguments");
  });

  it("decides from the server's deployment environment, the allowlist and the in-code fixtures — and not NODE_ENV alone", () => {
    assert.match(offer, /process\.env\.ATLAS_DEPLOYMENT_ENV/);
    assert.match(offer, /process\.env\.ATLAS_TEST_ENTRY_ACCOUNTS/);
    assert.match(offer, /TEST_ENTRY_FIXTURES/);
    assert.match(offer, /decideTestEntry\(/);
    assert.doesNotMatch(actions + offer, /NODE_ENV/);
  });

  it("re-decides inside the action, rather than trusting that the button was only shown to the right people", () => {
    const body = actions.slice(actions.indexOf("export async function enterTestStayFormAction"));
    assert.match(body, /decideForCurrentUser\(user\.id\)/);
    assert.match(body, /if \(!decision\.allowed\)/);
  });

  it("reads the account's email from the database row of the authenticated user id", () => {
    assert.match(offer, /findUserById\(userId\)/);
    assert.match(offer, /accountEmail: account\?\.email/);
  });

  it("never silently ends a real stay for the test fixture", () => {
    assert.match(actions, /existing && existing\.hotel\.id !== hotel\.id/);
  });

  it("opens the same kind of stay as normal entry, through the same one-active-stay write", () => {
    assert.match(actions, /createHotelStay\(/);
  });
});

describe("the decision helpers are not callable from a browser", () => {
  it('the "use server" module exports exactly one function, the argument-less entry action', () => {
    const source = read("src/features/test-entry/actions.ts");
    const exported = [...source.matchAll(/export (?:async )?(?:function|const) (\w+)/g)].map((match) => match[1]);
    assert.deepEqual(exported, ["enterTestStayFormAction"]);
  });

  it('the offer module is server-only and is not a "use server" file', () => {
    const source = read("src/features/test-entry/offer.ts");
    assert.match(source, /^import "server-only";/);
    assert.doesNotMatch(stripComments(source), /"use server"/);
  });
});

describe("the fixture mapping is fictional and fixed", () => {
  it("maps only the seeded fictional guest to the seeded fictional hotel", () => {
    assert.deepEqual(TEST_ENTRY_FIXTURES, { [DEV_FIXTURE_EMAILS.guest]: DEV_FIXTURE_IDS.hotelA });
    assert.match(DEV_FIXTURE_EMAILS.guest, /\.test$/);
  });

  it("is never extended from environment variables", () => {
    const fixtures = stripComments(read("src/services/deployment/test-fixtures.ts"));
    assert.doesNotMatch(fixtures, /process\.env/);
  });
});

describe("the offer on the home page is presentation only", () => {
  const home = stripComments(read("src/app/(app)/page.tsx"));

  it("shows the button only when the server says so, through the same decision", () => {
    assert.match(home, /isTestEntryOffered\(user\.id\)/);
    assert.match(home, /testEntryOffered &&/);
    assert.match(home, /@\/features\/test-entry\/offer/);
  });

  it("is documented as non-production in what the guest reads", () => {
    assert.match(read("src/app/(app)/page.tsx"), /non-production only/);
  });
});
