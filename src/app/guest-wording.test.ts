import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/*
 * Catalogue phase C5 (docs/catalogue-model-plan.md §3): guest screens never mention approval, contracts or
 * commission. The only guest-visible trace of a hotel partnership is "Recommended by <hotel>".
 *
 * Scans the text a guest can read: string literals and JSX text in guest pages, guest components and the advisor
 * messages. Comments and identifiers are ignored.
 */

const GUEST_SOURCES = [
  "src/app/(guest)",
  "src/app/(app)",
  "src/app/demo",
  "src/components/atlas-ui",
  "src/components/guest",
  "src/services/advisor",
  "src/features/plan",
  "src/features/feedback",
];

const FORBIDDEN = /approv|contract|commission|signed off/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** The readable text in a source file: string literals and JSX text, with comments removed. */
function guestText(source: string): string[] {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const strings = [...code.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2] ?? m[3]);
  const jsxText = [...code.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map((m) => m[1]);
  return [...strings, ...jsxText];
}

test("guest-reachable text never mentions approval, contracts or commission", () => {
  const offenders: string[] = [];
  for (const dir of GUEST_SOURCES) {
    for (const file of sourceFiles(join(process.cwd(), dir))) {
      for (const text of guestText(readFileSync(file, "utf8"))) {
        if (FORBIDDEN.test(text)) offenders.push(`${relative(process.cwd(), file)}: ${text.trim().slice(0, 100)}`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("the guard catches the old wording", () => {
  assert.ok(guestText('const a = "Approved by Hotel A";').some((text) => FORBIDDEN.test(text)));
  assert.ok(guestText("<p>the partners it has approved</p>").some((text) => FORBIDDEN.test(text)));
  assert.ok(!guestText("// approved 2026-10-14\nconst b = 1;").some((text) => FORBIDDEN.test(text)));
});
