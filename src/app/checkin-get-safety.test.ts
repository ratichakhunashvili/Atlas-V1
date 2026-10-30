import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The scan landing is a GET, and a GET that writes is a GET that fires again on a
 * reload, a back button, a prefetch or a link preview — none of which is a guest
 * deciding to check in. These guards fail if a write creeps back into the render
 * path, which no runtime test would catch until it had already happened.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const LANDING = "src/app/(app)/checkin/[token]/page.tsx";
const ACTIONS = "src/features/hotel-stays/actions.ts";

/** The body of one exported function, up to the next top-level declaration. */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const rest = source.slice(start + 1);
  const end = rest.indexOf("\nexport ");
  return end === -1 ? rest : rest.slice(0, end);
}

test("the scan landing renders from a read-only preview and writes nothing", () => {
  const landing = stripComments(read(LANDING));

  assert.match(landing, /previewHotelEntryByToken\(token\)/, "the GET must use the read-only path");
  // The write helpers must not be reachable from the page body at all.
  for (const writer of ["enterHotelByToken", "recordPendingHotelSwitch", "createHotelStay", "switchActiveStay", "clearPendingHotelSwitch"]) {
    assert.doesNotMatch(
      landing,
      new RegExp(`${writer}\\s*\\(`),
      `${LANDING} must not call ${writer} while rendering`
    );
  }
});

test("the preview itself performs no write", () => {
  const body = stripComments(functionBody(read(ACTIONS), "previewHotelEntryByToken"));

  for (const writer of ["createHotelStay", "recordPendingHotelSwitch", "clearPendingHotelSwitch", "switchActiveStay", "revalidatePath"]) {
    assert.doesNotMatch(body, new RegExp(`${writer}\\s*\\(`), `previewHotelEntryByToken must not call ${writer}`);
  }

  // It still has to resolve the credential and read the stay to say anything useful.
  assert.match(body, /resolveHotelFromToken\(/);
  assert.match(body, /findActiveStayForUser\(/);
});

test("the writes live behind an explicit action the guest has to press", () => {
  const actions = read(ACTIONS);
  const body = stripComments(functionBody(actions, "enterHotelByToken"));

  assert.match(body, /createHotelStay\(/, "starting a stay belongs here");
  assert.match(body, /recordPendingHotelSwitch\(/, "so does recording a pending switch");

  // And a form action exists for the landing's button to post to.
  assert.match(actions, /export async function enterHotelFormAction\(token: string\)/);

  const landing = stripComments(read(LANDING));
  assert.match(landing, /<form action=\{enterHotelFormAction\.bind\(null, token\)\}>/);
  assert.match(landing, /<Button type="submit">/);
});

test("ending a stay still takes its own confirmation, on a page carrying no token", () => {
  const landing = stripComments(read(LANDING));
  // The landing never switches anyone: at most it records the intent and hands off.
  assert.doesNotMatch(landing, /confirmPendingHotelSwitch/);

  const confirm = stripComments(read("src/app/(app)/checkin/confirm/page.tsx"));
  assert.doesNotMatch(confirm, /token/i, "the confirmation page must not touch a token");
  assert.match(confirm, /action=\{confirmHotelSwitchFormAction\}/);
});
