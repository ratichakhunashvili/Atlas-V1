import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * The prototype must stay a self-contained, fixture-only demo: no database,
 * authentication, Mapbox, GPS or QR-scanning code. Type-only imports of the
 * schema types are the single allowed exception (they are erased at build).
 */

const SRC = join(process.cwd(), "src");

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const prototypeFiles = [...listFiles(join(SRC, "prototype")), ...listFiles(join(SRC, "app", "demo"))]
  .filter((full) => !full.endsWith(".test.ts"))
  .map((full) => ({ path: relative(SRC, full).split(sep).join("/"), text: readFileSync(full, "utf8") }));

const FORBIDDEN: Array<[RegExp, string]> = [
  [/from\s+["']@\/db(\/(?!schema["']).*)?["']/, "database access"],
  [/import\s+(?!type\b)[^;]*from\s+["']@\/db\/schema["']/, "runtime import of the database schema (use `import type`)"],
  [/from\s+["']@\/auth/, "authentication"],
  [/next-auth/, "authentication"],
  [/from\s+["']@\/lib\/authorization["']/, "authorization/session"],
  [/mapbox/i, "Mapbox"],
  [/navigator\.geolocation|getCurrentPosition|watchPosition/, "GPS / geolocation"],
  [/html5-qrcode|Html5Qrcode|getUserMedia/, "QR scanning / camera"],
  [/from\s+["']@\/services\/(advisor|routing|location|qr|storage)/, "production Advisor/routing/location/QR services"],
  [/from\s+["']@\/services\/eligibility["']/, "the DB-backed eligibility entry point (only the pure rules module is allowed)"],
  [/"use client"|'use client'/, "client-side JavaScript (the prototype is server-rendered)"],
];

describe("prototype stays fixture-only", () => {
  test("there are prototype files to check", () => assert.ok(prototypeFiles.length >= 8));

  test("no forbidden dependency appears in prototype code or /demo routes", () => {
    for (const file of prototypeFiles) {
      for (const [pattern, label] of FORBIDDEN) {
        assert.doesNotMatch(file.text, pattern, `${file.path} must not use ${label}`);
      }
    }
  });

  test("the demo routes read the hotel only from the QR token param", () => {
    for (const file of prototypeFiles.filter((f) => f.path.startsWith("app/demo/"))) {
      assert.doesNotMatch(file.text, /\b(hotelId|hotel_id|placeId|place_id)\b\s*[:=]\s*(raw|searchParams)/, file.path);
      assert.doesNotMatch(file.text, /raw\.(hotelId|placeId)/, file.path);
    }
  });
});
