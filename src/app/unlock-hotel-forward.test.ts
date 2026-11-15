import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

// Owner decision, 2026-11-16: a hotel entry code printed with a place-style /U/ link (Skillwill's printed code)
// attaches the guest to the hotel. /unlock forwards such a code to the hotel entry landing.
test("a hotel entry code opened through /unlock goes to hotel entry, before any sign-in step", () => {
  const page = read("src/app/(guest)/unlock/[token]/page.tsx");
  const forward = page.indexOf("if (await resolveHotelFromToken(token, new Date())) redirect(`/checkin/${encodeURIComponent(token)}`)");
  const signIn = page.indexOf("await requireUser()");
  assert.ok(forward > 0, "the hotel check and forward exist");
  assert.ok(signIn > forward, "checked first, so signing up from that code still joins the hotel");
  // The forward only goes to /checkin, whose own checks (purpose, revocation, expiry, stay switch) decide everything.
  assert.match(read("src/features/hotel-stays/resolve-hotel-token.ts"), /resolveScannedQrToken\(parsed\.data\.token, "hotel_entry"/);
});

test("the app's hotel scanner accepts every Atlas link form and leaves the decision to the server", () => {
  const shell = read("src/components/guest/guest-app-shell.tsx");
  assert.match(shell, /const token = extractQrToken\(raw\)/);
  assert.match(read("src/services/qr/extract.ts"), /\(\?:checkin\|unlock\|C\|U\)/);
});
