import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * A model's display anchor must never become a Place field, and no Place-derived behaviour may read it.
 *
 * These are structural guards over the source, in the same spirit as services/eligibility/guest-paths.test.ts: the
 * runtime tests prove the arithmetic, and these make sure a later edit cannot quietly wire an anchor into
 * eligibility, routing or check-in without a test going red.
 */

const SRC = join(process.cwd(), "src");
const read = (path: string) => readFileSync(join(SRC, path), "utf8");
const stripComments = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = join(directory, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

describe("moving a model cannot move a Place", () => {
  it("the model admin actions import no Place writer", () => {
    const actions = stripComments(read("features/place-models/actions.ts"));
    for (const writer of ["updatePlace", "createPlace", "deletePlace", "setPlaceArchived"]) {
      assert.equal(new RegExp(`\\b${writer}\\b`).test(actions), false, `model actions must not call ${writer}`);
    }
    // Reading the Place (to validate the anchor against its real location) is expected.
    assert.match(actions, /findPlaceById/);
  });

  it("the placement save operation names no places column at all", () => {
    const operation = stripComments(read("db/operations/place-model-settings.ts"));
    assert.equal(/\bplaces\b/.test(operation.replace(/place_models|placeModels|PlaceModel/g, "")), false);
    assert.match(operation, /\.update\(placeModels\)/);
  });
});

describe("nothing Place-derived reads a display anchor", () => {
  const ANCHOR_USERS = /anchorLatitude|anchorLongitude|anchor_latitude|anchor_longitude/;

  it("eligibility, Advisor, check-in, routing and directions never mention an anchor", () => {
    const guarded = walk(SRC).filter((file) => {
      const path = relative(SRC, file).replace(/\\/g, "/");
      return (
        !path.endsWith(".test.ts") &&
        (path.startsWith("services/eligibility/") ||
          path.startsWith("services/advisor/") ||
          path.startsWith("services/routing/") ||
          path.startsWith("services/qr/") ||
          path.startsWith("services/ar/") ||
          path.startsWith("db/queries/itinerary") ||
          path.startsWith("db/queries/place-visits") ||
          path.startsWith("db/operations/place-visits"))
      );
    });
    assert.ok(guarded.length > 10, "the guard actually covers the Place-derived modules");

    const offenders = guarded.filter((file) => ANCHOR_USERS.test(stripComments(readFileSync(file, "utf8"))));
    assert.deepEqual(offenders.map((file) => relative(SRC, file)), []);
  });

  it("the guest payload keeps the canonical coordinates separate from the anchor", () => {
    const guest = stripComments(read("services/map3d/guest-models.ts"));
    assert.match(guest, /latitude: place\.latitude/);
    assert.match(guest, /anchorLatitude: anchor\.latitude/);
  });
});
