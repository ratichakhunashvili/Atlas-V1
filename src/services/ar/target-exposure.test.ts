import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Source guards for the two properties a runtime test cannot observe:
 *
 *  1. **The reference hash stays on the server.** A client that held it could
 *     submit a perfect match from anywhere, which would reduce AR verification to
 *     a formality. No runtime assertion catches someone adding it to a payload
 *     next year; reading the source does.
 *
 *  2. **No photograph is stored, uploaded or transmitted.** The feature's privacy
 *     promise is not "we delete the photos" — it is that there are none. That is
 *     only true as long as nothing in the AR path handles an image, so this
 *     checks that nothing does.
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

const byPath = (path: string) => files.find((file) => file.path === path)?.text ?? "";

/** Comments explain the rules; they must not be mistaken for code that follows them. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

describe("the stored reference hash never reaches a client", () => {
  test("only the AR check-in service reads it", () => {
    const readers = files.filter(
      (file) => stripComments(file.text).includes("findArTargetHash") && !file.path.endsWith(".test.ts")
    );

    assert.deepEqual(
      readers.map((file) => file.path).sort(),
      ["db/queries/place-ar-targets.ts", "services/advisor/check-in-ar.ts"],
      "the one function that returns a target hash must have exactly one caller"
    );
  });

  test("the AR check-in service never puts it in a result", () => {
    const source = stripComments(byPath("services/advisor/check-in-ar.ts"));

    // The hash is bound to `target` and used only in the comparison call.
    assert.ok(/\btarget\b/.test(source), "the service reads a target");

    // No returned object mentions it, and no message interpolates it.
    assert.doesNotMatch(source, /\breturn\s*\{[^}]*\btarget\b/, "the target must not be returned");
    assert.doesNotMatch(source, /message:\s*`[^`]*\$\{[^}]*target/, "the target must not reach a guest message");
  });

  test("the result type has no field that could carry it", () => {
    const source = byPath("services/advisor/check-in-ar.ts");
    const resultType = /export type ArCheckInResult =[\s\S]*?};/.exec(source)?.[0] ?? "";

    assert.ok(resultType, "the result type is declared");
    assert.doesNotMatch(resultType, /hash/i);
    // No distance either: how close a capture came is itself a usable hint.
    assert.doesNotMatch(resultType, /\bdistance\b(?!Meters)/);
  });

  test("nothing logs it", () => {
    for (const file of files) {
      if (file.path.endsWith(".test.ts")) continue;
      const source = stripComments(file.text);
      assert.doesNotMatch(
        source,
        /console\.\w+\([^)]*(targetHash|findArTargetHash)/,
        `${file.path} must not log the AR reference hash`
      );
    }
  });

  test("the admin listing selects every column except the hash", () => {
    const source = byPath("db/queries/place-ar-targets.ts");
    const listing = /export async function listArTargetsForAdmin\(\)[\s\S]*?\n}/.exec(source)?.[0] ?? "";

    assert.ok(listing, "the admin listing exists");
    assert.doesNotMatch(listing, /targetHash/, "an admin page is still a browser");
    // And it is an explicit column list rather than a whole-row select, which is
    // what makes the line above meaningful rather than coincidental.
    assert.match(listing, /\.select\(\{/);
  });

  test("no query in the module selects whole rows, which would include the hash", () => {
    const source = stripComments(byPath("db/queries/place-ar-targets.ts"));
    const selects = source.match(/\.select\((\{)?/g) ?? [];

    assert.ok(selects.length > 0, "the module has reads");
    assert.deepEqual(
      selects.filter((select) => !select.includes("{")),
      [],
      "every select must name its columns, so adding a column cannot leak the hash"
    );
  });
});

describe("no photograph is stored, uploaded or transmitted", () => {
  const arPaths = [
    "services/ar/hash.ts",
    "services/ar/greyscale.ts",
    "services/advisor/check-in-ar.ts",
    "db/queries/place-ar-targets.ts",
    "db/schema/place-ar-targets.ts",
    "components/ar/capture.ts",
  ];

  test("the AR modules all exist", () => {
    for (const path of arPaths) assert.ok(byPath(path), `${path} is missing`);
  });

  test("nothing in the AR path uploads, stores or fetches an image", () => {
    for (const path of arPaths) {
      const source = stripComments(byPath(path));

      for (const forbidden of [/\bfetch\s*\(/, /FormData/, /uploadModelFile|\bput\s*\(/, /toDataURL/, /toBlob/]) {
        assert.doesNotMatch(source, forbidden, `${path} must not move image data anywhere`);
      }
    }
  });

  test("the capture module keeps the pixels local and returns only a hash", () => {
    const source = stripComments(byPath("components/ar/capture.ts"));

    /*
     * The canvas is bounded at the shared DOWNSCALE_SIZE constant — a thumbnail,
     * not a photograph — and the buffer that is read back is that same size. A
     * literal here instead of the constant would let the capture path and the
     * tested reduction drift apart silently.
     */
    assert.match(source, /canvas\.width\s*=\s*DOWNSCALE_SIZE/);
    assert.match(source, /canvas\.height\s*=\s*DOWNSCALE_SIZE/);
    assert.match(source, /getImageData\(0,\s*0,\s*DOWNSCALE_SIZE,\s*DOWNSCALE_SIZE\)/);
    // And it is blanked once the hash exists.
    assert.match(source, /clearRect\(0,\s*0,\s*DOWNSCALE_SIZE,\s*DOWNSCALE_SIZE\)/);

    // And the camera is always released.
    assert.match(source, /getTracks\(\)\.forEach\(\(track\) => track\.stop\(\)\)/);
  });

  test("the AR database table has no column that could hold an image", () => {
    const source = stripComments(byPath("db/schema/place-ar-targets.ts"));

    for (const forbidden of [/\bbytea\b/i, /imageUrl/, /image_url/, /storageKey/, /storage_key/, /\bblob\b/i]) {
      assert.doesNotMatch(source, forbidden, "the AR target table stores a hash and nothing else");
    }
  });

  test("the action boundary accepts a hash, never an image", () => {
    const schema = stripComments(byPath("features/advisor/schema.ts"));
    const arSchema = /export const checkInArSchema =[\s\S]*?\}\);/.exec(schema)?.[0] ?? "";

    assert.ok(arSchema, "the AR schema exists");
    assert.match(arSchema, /\^\[0-9a-f\]\{60\}\$/, "the hash shape is pinned at the boundary");
    for (const forbidden of [/z\.instanceof\(File\)/, /\bimage\b/i, /\bphoto\b/i, /base64/i, /dataUrl/i]) {
      assert.doesNotMatch(arSchema, forbidden, "no field here may carry an image");
    }
  });
});

describe("the approved matching parameters are the ones in the code", () => {
  const source = byPath("services/ar/hash.ts");

  test("16x16 grid, 240 bits, threshold 0.22", () => {
    assert.match(source, /export const HASH_GRID = 16;/);
    assert.match(source, /export const HASH_BITS = HASH_GRID \* \(HASH_GRID - 1\);/);
    assert.match(source, /export const AR_MATCH_THRESHOLD = 0\.22;/);
  });

  test("the threshold is not configurable from outside the server", () => {
    const callers = files.filter(
      (file) => !file.path.endsWith(".test.ts") && /compareHashes\(/.test(stripComments(file.text))
    );

    for (const file of callers) {
      if (file.path === "services/ar/hash.ts") continue;
      // Three arguments would mean a caller chose the threshold; the only
      // production caller must take the approved default.
      assert.doesNotMatch(
        stripComments(file.text),
        /compareHashes\([^)]*,[^)]*,[^)]*\)/,
        `${file.path} must not pass its own matching threshold`
      );
    }
  });
});
