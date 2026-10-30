import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Static architecture guards for the hotel-specific partner rule. These are
 * deliberately blunt source checks: they fail loudly if someone later wires a
 * guest-facing feature to an unscoped Place query instead of
 * services/eligibility. They complement (not replace) the behavioural tests.
 */

const SRC = join(process.cwd(), "src");

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const files = listSourceFiles(SRC).map((full) => ({
  path: relative(SRC, full).split(sep).join("/"),
  text: readFileSync(full, "utf8"),
}));

describe("no guest-facing code can read Places without eligibility", () => {
  test("the unscoped admin* Place queries are referenced only by their own definition file", () => {
    const names = ["adminListPlacesNear", "adminListFullPlacesNear", "adminSearchPlacesByName"];
    for (const name of names) {
      const users = files.filter((f) => f.text.includes(name) && f.path !== "db/queries/places.ts" && !f.path.endsWith(".test.ts"));
      assert.deepEqual(
        users.map((f) => f.path),
        [],
        `${name} returns Places with no hotel eligibility filter and must not be used by app code`
      );
    }
  });

  test("the old unscoped query names no longer exist anywhere", () => {
    for (const legacy of ["listPlacesNear(", "listFullPlacesNear(", "searchPlacesByName("]) {
      const users = files.filter((f) => f.text.replace(/admin(List|Search)\w*/g, "").includes(legacy) && !f.path.endsWith(".test.ts"));
      assert.deepEqual(users.map((f) => f.path), [], legacy);
    }
  });

  test("the legacy hotel_places table is no longer read or written by any application code", () => {
    const users = files.filter(
      (f) => (f.text.includes("hotelPlaces") || f.text.includes("queries/hotel-places")) && !f.path.startsWith("db/schema/") && !f.path.endsWith(".test.ts")
    );
    assert.deepEqual(users.map((f) => f.path), []);
  });

  test("only the query modules that own Place/relationship reads select from the places table", () => {
    const allowed = new Set([
      "db/queries/places.ts",
      "db/queries/hotels.ts",
      "db/queries/hotel-stays.ts",
      "db/queries/hotel-partnerships.ts",
      "db/queries/hotel-facilities.ts",
      // Reads a hotel event's venue Place for its NAME in the admin list. Events are
      // hotel-scoped and their venue must pass ordinary eligibility before the
      // Advisor will use one (services/advisor/hotel-events.ts).
      "db/queries/hotel-events.ts",
      // Reads one hotel's Place for its NAME, to ask "switch to <hotel>?". It
      // resolves no recommendations and returns no Place to a guest-facing list.
      "db/operations/pending-hotel-switches.ts",
      /*
       * Joins places for a model's ANCHOR COORDINATES. It cannot widen eligibility:
       * listModelsForPlaces takes an explicit list of already-eligible Place ids and
       * returns nothing for an empty list, so it can only ever narrow what the caller
       * had already resolved. Pinned by the assertions below.
       */
      "db/queries/place-models.ts",
      // Reads a Place NAME for the admin badge listing. Admin-only, hands no Place to
      // a guest, and decides no eligibility.
      "db/operations/achievements.ts",
      /*
       * Joins places for a Place NAME in the ADMIN listing of AR targets only. It
       * resolves no recommendations, returns no Place to a guest, and decides no
       * eligibility: an AR check-in looks its target up by the placeId of a stop the
       * guest's own itinerary already contains, which eligibility has already
       * decided. Pinned by services/ar/target-exposure.test.ts, which additionally
       * proves the reference hash never leaves the server.
       */
      "db/queries/place-ar-targets.ts",
      /*
       * ADMIN dashboard review queue: joins places for the NAME of a pending partnership's Place so an admin can
       * open the right hotel. Admin-only (the page sits under the admin layout), returns no Place to a guest and
       * decides no eligibility.
       */
      "db/queries/admin-metrics.ts",
      /*
       * ADMIN guest-support lookup: joins places for the NAME of the hotel a guest is staying at. Behind
       * requireAdmin(), audited, exact-email only, and it returns no Place list, coordinates or stop names.
       * Pinned by db/guest-support.pglite.test.ts.
       */
      "db/operations/guest-support.ts",
    ]);
    const users = files.filter((f) => /\.(from|innerJoin|leftJoin)\(places\b/.test(f.text) && !f.path.endsWith(".test.ts"));
    for (const f of users) assert.ok(allowed.has(f.path), `${f.path} reads the places table directly; route guest reads through services/eligibility`);
  });

  test("the nearby API route, the home page and the Advisor all go through services/eligibility", () => {
    const get = (p: string) => files.find((f) => f.path === p)?.text ?? "";
    assert.match(get("app/api/places/nearby/route.ts"), /getEligibleMapPlacesForGuest/);
    assert.match(get("app/(app)/page.tsx"), /getEligibleMapPlacesForGuest/);
    assert.match(get("services/advisor/generate-itinerary.ts"), /listEligiblePlacesForStay/);
    assert.doesNotMatch(get("app/api/places/nearby/route.ts"), /@\/db\/queries\/places/);
    assert.doesNotMatch(get("app/(app)/page.tsx"), /@\/db\/queries\/places/);
  });

  test("the nearby route never reads a hotel or place id from the request", () => {
    const route = files.find((f) => f.path === "app/api/places/nearby/route.ts")?.text ?? "";
    assert.doesNotMatch(route, /searchParams\.get\(["'](hotelId|hotel_id|placeId|place_id)["']\)/);
  });
});

describe("migration 0002 is additive and preserves hotel_places", () => {
  const migrationDir = join(SRC, "db", "migrations");
  const file = readdirSync(migrationDir).find((name) => name.startsWith("0002_") && name.endsWith(".sql"));
  const sql = file ? readFileSync(join(migrationDir, file), "utf8") : "";

  test("the migration file exists", () => assert.ok(file, "0002 migration present"));

  test("it never drops, deletes from, updates, truncates or alters hotel_places", () => {
    assert.doesNotMatch(sql, /DROP\s+TABLE/i);
    assert.doesNotMatch(sql, /DELETE\s+FROM/i);
    assert.doesNotMatch(sql, /TRUNCATE/i);
    assert.doesNotMatch(sql, /UPDATE\s+"?hotel_places"?/i);
    assert.doesNotMatch(sql, /ALTER\s+TABLE\s+"?hotel_places"?/i);
    assert.doesNotMatch(sql, /DROP\s+COLUMN/i);
  });

  test("it copies legacy rows as pending_review only — never active, never confirmed", () => {
    const insert = /INSERT INTO "hotel_partnerships"[\s\S]*?FROM "hotel_places"/i.exec(sql)?.[0] ?? "";
    assert.ok(insert, "the legacy copy exists");
    assert.match(insert, /'pending_review'/);
    assert.doesNotMatch(insert, /'active'/);
    assert.doesNotMatch(insert, /confirmed_at|confirmed_by/);
  });
});

describe("eligibility rules live in exactly one place", () => {
  const nonTest = files.filter((f) => !f.path.endsWith(".test.ts"));

  test("only services/eligibility reads the partnership/facility rows that feed eligibility", () => {
    for (const name of ["listPartnershipRowsForHotel", "listFacilityRowsForHotel"]) {
      const users = nonTest.filter((f) => f.text.includes(name) && f.path !== `db/queries/${name === "listPartnershipRowsForHotel" ? "hotel-partnerships" : "hotel-facilities"}.ts`);
      assert.deepEqual(users.map((f) => f.path), ["services/eligibility/index.ts"], name);
    }
  });

  test("the rule functions are used only by the eligibility service (and the fixture-only prototype that reuses the same rule)", () => {
    const allowed = new Set(["services/eligibility/rules.ts", "services/eligibility/index.ts", "prototype/eligibility.ts"]);
    for (const name of ["buildEligiblePlaces", "isPartnershipEligible", "isFacilityEligible", "isPlaceRecommendable"]) {
      const users = nonTest.filter((f) => f.text.includes(name) && !allowed.has(f.path));
      assert.deepEqual(users.map((f) => f.path), [], `${name} must not be called (or re-implemented) outside the eligibility service`);
    }
  });

  test("no other module re-implements the status checks that define eligibility", () => {
    // Admin screens that merely SHOW a row's own status, and the query that writes status timestamps, are not eligibility decisions.
    const allowed = new Set([
      "services/eligibility/rules.ts",
      "db/queries/places.ts",
      "app/(app)/admin/hotels/[id]/facilities/page.tsx",
      "app/(app)/admin/hotels/[id]/partnerships/page.tsx",
    ]);
    const patterns = [
      /publicationStatuss*===s*["']published["']/,
      /verificationStatuss*===s*["']verified["']/,
      /(partnership|facility|row|relation).statuss*===s*["']active["']/,
      /.confirmedAts*(===|!==)s*null/,
    ];
    for (const f of nonTest) {
      if (allowed.has(f.path)) continue;
      for (const pattern of patterns) assert.doesNotMatch(f.text, pattern, `${f.path} must not re-implement eligibility (${pattern})`);
    }
  });

  test("the service entry points guests and features must use are exported", () => {
    const index = nonTest.find((f) => f.path === "services/eligibility/index.ts")?.text ?? "";
    for (const name of [
      "resolveGuestHotelContext",
      "authorizeGuestHotel",
      "listEligibleExperiencesForGuest",
      "getEligibleExperienceForGuest",
      "getEligibleMapPlacesForGuest",
      "listEligiblePlacesForStay",
    ]) {
      assert.match(index, new RegExp(`export async function ${name}\\b`), name);
    }
    assert.doesNotMatch(index, /export async function listEligiblePlacesForHotel\b/, "no raw hotel-id entry point");
  });
});

describe("migration 0003 (place publication / verification) is additive and conservative", () => {
  const dir = join(SRC, "db", "migrations");
  const name = readdirSync(dir).find((n) => n.startsWith("0003_") && n.endsWith(".sql"));
  const sql = name ? readFileSync(join(dir, name), "utf8") : "";

  test("it exists and only adds columns and constraints", () => {
    assert.ok(name, "0003 migration present");
    assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN|CONSTRAINT)/i);
    assert.doesNotMatch(sql, /DELETE\s+FROM|TRUNCATE/i);
    assert.doesNotMatch(sql, /\bUPDATE\b/i);
  });

  test("existing and new Places default to draft / unverified, so nothing becomes recommendable by accident", () => {
    assert.match(sql, /"publication_status" text DEFAULT 'draft' NOT NULL/);
    assert.match(sql, /"verification_status" text DEFAULT 'unverified' NOT NULL/);
    assert.doesNotMatch(sql, /DEFAULT 'published'|DEFAULT 'verified'/);
  });

  test("status and its timestamp must agree, and archiving implies unpublished", () => {
    assert.match(sql, /places_published_requires_date_check/);
    assert.match(sql, /places_verified_requires_date_check/);
    assert.match(sql, /places_archived_not_published_check/);
  });
});

describe("3D models stay behind the eligibility boundary", () => {
  const read = (path: string) => readFileSync(join(SRC, path), "utf8");

  test("the guest model service resolves eligibility BEFORE asking for any model", () => {
    const service = read("services/map3d/index.ts");

    // Eligible ids first, and an empty set short-circuits without touching models.
    assert.match(service, /const eligiblePlaceIds = await d\.listEligiblePlaceIds\(userId, now\)/);
    assert.match(service, /if \(eligiblePlaceIds\.length === 0\) return \[\]/);
    assert.match(service, /getEligibleMapPlacesForGuest/);
  });

  test("the model query can only narrow an already-eligible list, never widen it", () => {
    const query = read("db/queries/place-models.ts");

    // It takes ids; it does not go and find its own.
    assert.match(query, /export async function listModelsForPlaces\(placeIds: readonly string\[\]\)/);
    assert.match(query, /if \(placeIds\.length === 0\) return \[\]/);
    assert.match(query, /inArray\(placeModels\.placeId/);
  });

  test("lock state comes from permanent visits, never from itinerary stops", () => {
    // Comments stripped: the file explains what the unlock source is NOT, which is
    // documentation rather than a dependency on it.
    const guestModels = read("services/map3d/guest-models.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    const service = read("services/map3d/index.ts");

    assert.match(guestModels, /visitedPlaceIds\.has\(place\.id\)/);
    assert.doesNotMatch(guestModels, /itinerary|visitedAt|completed/i, "stop completion is not the unlock source");
    assert.match(service, /listPlaceVisitsForUser/);
  });
});
