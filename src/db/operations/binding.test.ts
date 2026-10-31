import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The query wrapper exists only to bind the production database handle to an
 * operation the PGlite tests call directly. If logic creeps back into a wrapper,
 * it becomes code no test covers — which is exactly the drift these guards exist
 * to prevent.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const BOUND_WRAPPERS = [
  { file: "src/db/queries/hotel-stays.ts", functions: ["switchActiveStay", "createHotelStay"] },
  {
    file: "src/db/queries/pending-hotel-switches.ts",
    functions: ["recordPendingHotelSwitch", "findPendingHotelSwitch", "clearPendingHotelSwitch"],
  },
] as const;

test("every bound wrapper delegates to its operation in a single call", () => {
  for (const { file, functions } of BOUND_WRAPPERS) {
    const source = read(file);
    for (const name of functions) {
      // The declaration plus a little after it: a delegating wrapper is one return
      // statement, so anything else would have to appear inside this window.
      const start = source.indexOf(`export async function ${name}`);
      assert.notEqual(start, -1, `${file} no longer exports ${name}`);
      const declaration = source.slice(start, start + 400);

      assert.match(
        declaration,
        /return \w+\(\s*db,/,
        `${file}'s ${name} must delegate to its operation, not hold its own SQL`
      );
    }
  }
});

test("operations stay importable by a plain node --test run", () => {
  for (const file of [
    "src/db/operations/hotel-stays.ts",
    "src/db/operations/pending-hotel-switches.ts",
    "src/db/operations/types.ts",
  ]) {
    const source = read(file);
    // `server-only` throws outside Next's bundler, and importing the `@/db`
    // singleton would need DATABASE_URL and a real connection. Either one puts
    // the operation back out of reach of the tests.
    assert.doesNotMatch(source, /from "server-only"|import "server-only"/, `${file} must not import server-only`);
    assert.doesNotMatch(source, /from "@\/db"/, `${file} must take the database handle as an argument`);
  }
});

test("the PGlite tests call the real operations rather than re-implementing them", () => {
  const source = read("src/db/hotel-stays.pglite.test.ts");
  assert.match(source, /from "\.\/operations\/hotel-stays"/);
  assert.match(source, /from "\.\/operations\/pending-hotel-switches"/);
  assert.match(source, /switchActiveStay\(db, \{/);
});
