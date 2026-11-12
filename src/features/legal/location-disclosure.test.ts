import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { DATA_WE_STORE, LOCATION_SENT_WHEN, LOCATION_USE } from "./copy";

/*
 * CAND-04 and CAND-05. The location disclosure must match the code: the guest's position leaves the phone at
 * check-in AND when a walking route is requested (Atlas forwards it to Mapbox Directions). And no guest screen may
 * offer a call or data download that only says it is not connected.
 */

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const SRC_FILES = sourceFiles(join(process.cwd(), "src")).map((path) => ({ path: relative(process.cwd(), path), text: readFileSync(path, "utf8") }));

test("every location disclosure names both transfers: check-in and the walking route via Mapbox", () => {
  const storeLine = DATA_WE_STORE.find((line) => /location/i.test(line)) ?? "";
  for (const text of [LOCATION_USE, LOCATION_SENT_WHEN, storeLine]) {
    assert.match(text, /check(s)? in|check-ins?/i, text);
    assert.match(text, /walking route/i, text);
    assert.match(text, /Mapbox/, text);
  }
});

test("no source file claims location is sent only at check-in", () => {
  const CHECK_IN_ONLY = [/sent only (when|at the moment) you check in/i, /used only to show walk times and to confirm a check-in/i, /only when you check in\./i];
  const offenders = SRC_FILES.filter((file) => CHECK_IN_ONLY.some((pattern) => pattern.test(file.text))).map((file) => file.path);
  assert.deepEqual(offenders, []);
});

test("the privacy and permission screens use the shared disclosure", () => {
  assert.match(readFileSync("src/components/atlas-ui/privacy.tsx", "utf8"), /LOCATION_USE/);
  assert.match(readFileSync("src/app/(guest)/permissions/location/page.tsx", "utf8"), /LOCATION_SENT_WHEN/);
});

test("no guest screen offers a call or a data download that is not connected", () => {
  const DEAD_ACTIONS = [/Calling isn't connected/i, /FRONT_DESK_NOTICE/, /"Not available yet"/];
  const offenders = SRC_FILES.filter((file) => DEAD_ACTIONS.some((pattern) => pattern.test(file.text))).map((file) => file.path);
  assert.deepEqual(offenders, []);
});

test("Download my data is a real link to the export route", () => {
  const privacy = readFileSync("src/components/atlas-ui/privacy.tsx", "utf8");
  assert.match(privacy, /href="\/api\/account\/export"/);
});
