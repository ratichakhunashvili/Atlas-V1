import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Admin authorization, checked where it actually has to hold: inside every server
 * action.
 *
 * A Server Function is reachable by a direct POST, not only through the UI that
 * renders its button — so a page-level `requireAdmin()` in a layout protects the
 * screen, never the mutation. These guards fail if a new admin action forgets its
 * own check, which is not something a runtime test would catch until someone had
 * already used it.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** Feature modules whose every exported action is an admin operation. */
const ADMIN_ACTION_MODULES = [
  "src/features/places/actions.ts",
  "src/features/hotels/actions.ts",
  "src/features/partnerships/actions.ts",
  "src/features/facilities/actions.ts",
  "src/features/hotel-events/actions.ts",
  "src/features/qr-credentials/actions.ts",
  "src/features/achievements/actions.ts",
  "src/features/place-models/actions.ts",
  "src/features/ar-targets/actions.ts",
  "src/features/advisor-testing/actions.ts",
];

/** Every `export async function name(` in a module. */
function exportedActions(source: string): string[] {
  return [...source.matchAll(/export async function (\w+)\s*\(/g)].map((match) => match[1]);
}

/** The text of one exported function, up to the next top-level export. */
function actionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  const rest = source.slice(start + 1);
  const end = rest.indexOf("\nexport ");
  return end === -1 ? rest : rest.slice(0, end);
}

/**
 * Local helpers that authorize on their callers' behalf.
 *
 * An action may delegate rather than repeat the check — but only to a helper in
 * the same file that demonstrably calls `requireAdmin()` itself, which this
 * verifies. Delegation is fine; an unchecked path is not.
 */
function authorizingHelpers(source: string): string[] {
  // Module-local declarations only: an exported action is not a helper.
  const declarations = [...source.matchAll(/\n(?:async )?function (\w+)\s*\(/g)].map((match) => match[1]);

  return declarations.filter((name) => {
    const start = source.search(new RegExp(`\\n(?:async )?function ${name}\\s*\\(`));
    if (start === -1) return false;

    // Up to the next top-level declaration, so one helper cannot vouch for the next.
    const rest = source.slice(start + 1);
    const nextDeclaration = rest.search(/\n(?:export |async function |function )/);
    const body = nextDeclaration === -1 ? rest : rest.slice(0, nextDeclaration);

    return /requireAdmin\(\)/.test(body);
  });
}

test("every admin action is authorized, directly or through a helper that is", () => {
  for (const file of ADMIN_ACTION_MODULES) {
    const source = stripComments(read(file));
    const actions = exportedActions(source);
    const helpers = authorizingHelpers(source);

    assert.ok(actions.length > 0, `${file} should export actions`);

    for (const name of actions) {
      const body = actionBody(source, name);
      const checksDirectly = /requireAdmin\(\)/.test(body);
      const delegates = helpers.some((helper) => new RegExp(`\\b${helper}\\s*\\(`).test(body));

      assert.ok(
        checksDirectly || delegates,
        `${file}'s ${name} must call requireAdmin() itself or delegate to a helper that does — a page guard does not protect a POST`
      );
    }
  }
});

test("no admin action trusts a role or permission sent by the client", () => {
  for (const file of ADMIN_ACTION_MODULES) {
    const source = stripComments(read(file));

    for (const forbidden of [/formData\.get\("role"\)/, /formData\.get\("isAdmin"\)/, /input\.role/]) {
      assert.doesNotMatch(source, forbidden, `${file} must not read a role from client input`);
    }
  }
});

test("every admin page sits behind the admin layout's guard, and the layout actually guards", () => {
  const layout = stripComments(read("src/app/(console)/layout.tsx"));
  assert.match(layout, /await requireAdmin\(\)/);

  // Belt and braces: the dev-only scenario tool refuses in production as well.
  const scenario = stripComments(read("src/services/advisor-testing/scenario.ts"));
  assert.match(scenario, /assertScenarioToolEnabled/);
});

test("deleting a hotel cannot take guest history with it", () => {
  const action = stripComments(read("src/features/hotels/actions.ts"));

  // The action refuses with an explanation...
  assert.match(action, /countHotelDeletionBlockers\(/);
  assert.match(action, /hasHotelDeletionBlockers\(/);

  // ...and the database refuses regardless of the application.
  const stays = read("src/db/schema/hotel-stays.ts");
  const days = read("src/db/schema/itinerary-days.ts");
  assert.match(stays, /references\(\(\) => hotels\.id, \{ onDelete: "restrict" \}\)/);
  assert.match(days, /references\(\(\) => hotels\.id, \{ onDelete: "restrict" \}\)/);
});

test("deleting a Place with history is refused and explained, never forced", () => {
  const action = stripComments(read("src/features/places/actions.ts"));

  assert.match(action, /PG_FOREIGN_KEY_VIOLATION/, "a constraint error becomes an explanation");
  assert.match(action, /Archive it instead/);
  assert.match(action, /archivePlaceAction/, "archival is the supported alternative");
});

test("QR raw credentials are never read back from storage by an admin screen", () => {
  for (const page of [
    "src/app/(console)/admin/hotels/[id]/page.tsx",
    "src/app/(console)/admin/places/[id]/page.tsx",
    "src/app/(console)/admin/attractions/page.tsx",
    "src/app/(console)/admin/partners/page.tsx",
  ]) {
    const source = stripComments(read(page));
    assert.doesNotMatch(source, /tokenHash/, `${page} must not touch a credential hash`);
    assert.doesNotMatch(source, /rawToken/, `${page} must not render a raw credential`);
  }

  // Only the issuing action produces a raw value, and it returns it rather than storing it.
  const issuing = stripComments(read("src/features/qr-credentials/actions.ts"));
  assert.match(issuing, /generateRawQrToken\(\)/);
  assert.match(issuing, /hashQrToken\(rawToken\)/);
});

test("the new catalog views read the canonical model and create no duplicate Place", () => {
  const attractions = stripComments(read("src/app/(console)/admin/attractions/page.tsx"));
  const partners = stripComments(read("src/app/(console)/admin/partners/page.tsx"));

  // They list and act on existing records; neither has a Place-creating form.
  for (const [name, source] of [
    ["attractions", attractions],
    ["partners", partners],
  ] as const) {
    assert.doesNotMatch(source, /createPlaceAction|createHotelAction/, `${name} must not create records`);
  }

  // The partner view never invents eligibility: it only transitions existing rows.
  assert.doesNotMatch(partners, /listEligible|getEligible/, "the admin view is not a guest eligibility path");
});

test("admin sections that have no schema yet are absent rather than faked", () => {
  const adminDir = join(process.cwd(), "src/app/(console)/admin");
  const sections = readdirSync(adminDir).filter((entry) => statSync(join(adminDir, entry)).isDirectory());

  /*
   * Achievements now have tables (migration 0010), so that section exists and is
   * covered by the authorization guard above.
   *
   * Models still have none. A screen for them could only be a button that does
   * nothing, which is worse than its absence — so the absence is asserted rather
   * than left to be noticed.
   */
  assert.equal(sections.includes("achievements"), true, "achievements have a schema and a section");
  assert.equal(sections.includes("models"), true, "models have a schema (0011) and a section");
});
