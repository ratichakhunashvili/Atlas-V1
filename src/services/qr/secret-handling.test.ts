import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Source-level guards for the rules that no runtime test can catch after the
 * fact: a credential that reaches a browser has already leaked by the time any
 * assertion runs. These fail loudly if a later change reintroduces the old
 * raw-token habits.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

/** Source with comments removed, for assertions about what the code DOES rather than what it says. */
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(join(process.cwd(), dir))) {
    const relative = `${dir}/${entry}`;
    if (statSync(join(process.cwd(), relative)).isDirectory()) {
      sourceFiles(relative, found);
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      found.push(relative);
    }
  }
  return found;
}

test("nothing resolves a scan by comparing a raw column value any more", () => {
  for (const file of sourceFiles("src")) {
    const source = read(file);
    // Calls and declarations only — the tombstone comments left where these used
    // to live name them on purpose, so that a future reader knows why they went.
    assert.doesNotMatch(
      source,
      /(?:findHotelByQrToken|findPlaceByQrToken)\s*\(/,
      `${file} still resolves a QR scan through a raw token column; use services/qr + qr_credentials`
    );
    assert.doesNotMatch(
      source,
      /eq\((?:hotels|places)\.qrToken/,
      `${file} queries a legacy raw qr_token column`
    );
  }
});

test("the legacy qr_token columns are documented as unused rather than quietly read", () => {
  for (const [file, table] of [
    ["src/db/schema/hotels.ts", "hotels"],
    ["src/db/schema/places.ts", "places"],
  ] as const) {
    const source = read(file);
    assert.match(source, /LEGACY, no longer read or written/, `${table}.qr_token must say it is unused`);
  }
});

test("a raw credential is generated in exactly one place and never stored", () => {
  const generators = sourceFiles("src").filter((file) => /generateRawQrToken\s*\(/.test(read(file)));

  // The definition, plus the deliberate callers: the admin issue actions and the
  // scenario tool (which generates and discards). Each hashes before storing.
  assert.deepEqual(
    generators.sort(),
    [
      "src/features/advisor-testing/actions.ts",
      "src/features/qr-credentials/actions.ts",
      "src/services/advisor-testing/scenario.ts",
      "src/services/qr/token.ts",
    ],
    "a new caller of generateRawQrToken must be reviewed: the raw value must be hashed and never persisted"
  );

  for (const file of generators) {
    if (file === "src/services/qr/token.ts") continue;
    assert.match(read(file), /hashQrToken\(/, `${file} generates a raw token but never hashes one`);
  }
});

test("credential rows are written with a hash, never a raw token", () => {
  const source = read("src/db/queries/qr-credentials.ts");
  assert.match(source, /tokenHash: input\.tokenHash/);
  // The query layer takes a hash and has no way to make one, so it cannot be
  // handed a raw token by accident.
  assert.doesNotMatch(source, /generateRawQrToken|hashQrToken/);
});

test("admin screens report only whether a credential exists", () => {
  for (const page of [
    "src/app/(app)/admin/hotels/[id]/page.tsx",
    "src/app/(app)/admin/places/[id]/page.tsx",
  ]) {
    const source = read(page);
    assert.match(source, /findActiveQrCredentialFor(Hotel|Place)/);
    // Only presence and issue date cross to the client component.
    assert.match(source, /hasActiveCredential=\{\w+ !== null\}/);
    assert.doesNotMatch(source, /tokenHash/, `${page} must never pass a credential hash to the client`);
  }

  const table = read("src/components/hotel/hotel-table.tsx");
  assert.doesNotMatch(table, /hotel\.qrToken/, "the hotel list must not render a raw token");
});

test("the one-time reveal keeps the raw token in client memory only", () => {
  const panel = read("src/components/qr/qr-credential-panel.tsx");
  assert.match(panel, /useState<string \| null>\(null\)/);
  assert.match(panel, /Shown once/);
  // It arrives as the return value of an action the admin triggered — never as a
  // server-rendered prop, which would put it in the page payload.
  assert.doesNotMatch(panel, /rawToken[?]?:\s*string/);
});

test("the scenario tool exercises a real scan without holding a secret", () => {
  const actions = read("src/features/advisor-testing/actions.ts");
  assert.match(actions, /issueQrCredential/, "it must rotate rather than replay a stored token");
  assert.doesNotMatch(actions, /place\.qrToken/, "stored credentials are hashes; there is no raw token to replay");
});

test("the scanned token stops at the scan: the confirmation flow carries none", () => {
  // The scan landing is the ONE page whose URL already contains the token, so its
  // own button may post that same value back. What must not happen is the token
  // travelling on to a second page. (Its GET is also write-free — see
  // app/checkin-get-safety.test.ts.)
  const landing = read("src/app/(app)/checkin/[token]/page.tsx");
  assert.match(landing, /enterHotelFormAction\.bind\(null, token\)/);
  assert.match(landing, /previewHotelEntryByToken/, "the render path stays read-only");

  // The confirmation screen never sees a token: no route param, no bind argument,
  // no hidden field — so nothing to leak through a URL, a log or a shared link.
  // Comments stripped: the file DESCRIBES the absence of a token, which is not the same as using one.
  const confirm = stripComments(read("src/app/(app)/checkin/confirm/page.tsx"));
  assert.doesNotMatch(confirm, /token/i, "the confirmation page must not touch a token at all");
  assert.doesNotMatch(confirm, /params/, "the confirmation route must take no parameters");
  assert.match(confirm, /action=\{confirmHotelSwitchFormAction\}/);
  assert.doesNotMatch(confirm, /\.bind\(/, "a bound argument would put the value back in the page payload");

  const actions = read("src/features/hotel-stays/actions.ts");
  assert.match(
    actions,
    /export async function confirmHotelSwitchFormAction\(\)/,
    "the confirm action must take no input: the hotel comes from the server-held pending switch"
  );
  assert.match(actions, /export async function confirmPendingHotelSwitch\(now: Date = new Date\(\)\)/);
});

test("the hotel on the confirm path comes from the server, never from the client", () => {
  const actions = read("src/features/hotel-stays/actions.ts");
  const confirm = actions.slice(actions.indexOf("export async function confirmPendingHotelSwitch"));
  const body = confirm.slice(0, confirm.indexOf("\n}\n"));

  assert.match(body, /findPendingHotelSwitch\(user\.id, now\)/);
  // The only hotel id it ever uses is the one it read back for this user.
  assert.doesNotMatch(body, /resolveHotelFromToken|rawToken|formData/);
});

test("a manual code entry is consumed server-side and never put in a URL", () => {
  const actions = read("src/features/hotel-stays/actions.ts");
  const form = actions.slice(actions.indexOf("export async function checkInToHotelFormAction"));
  const body = form.slice(0, form.indexOf("\n}\n"));

  assert.match(body, /redirect\("\/checkin\/confirm"\)/);
  assert.doesNotMatch(body, /\/checkin\/\$\{/, "redirecting to /checkin/<token> would put the typed code in history");
});
