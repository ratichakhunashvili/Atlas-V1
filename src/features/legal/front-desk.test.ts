import { test } from "node:test";
import assert from "node:assert/strict";
import { RECEPTION_FALLBACK, frontDeskFor, normalizePhoneForTel } from "./front-desk";

const now = new Date("2026-11-12T12:00:00Z");
const day = (d: number) => new Date(now.getTime() + d * 86_400_000);
const stay = (overrides: Partial<{ checkOut: Date | null; expectedCheckOut: Date | null; hotelName: string; phone: string | null }> = {}) => ({
  checkOut: null,
  expectedCheckOut: day(2),
  hotelName: "Hotel X",
  phone: "+995 32 200 00 00",
  ...overrides,
});

test("phone numbers keep a leading + and their digits, and drop separators", () => {
  assert.equal(normalizePhoneForTel("+995 32 200 00 00"), "tel:+995322000000");
  assert.equal(normalizePhoneForTel(" (032) 200-00-00 "), "tel:0322000000");
  assert.equal(normalizePhoneForTel("+995.599.12.34.56"), "tel:+995599123456");
});

test("numbers that cannot be dialled as written are refused, never guessed", () => {
  for (const bad of [null, undefined, "", "   ", "call reception", "+995 32 200 00 00 ext 4", "++995322000000", "12345", "+1234567890123456", "995+322000000"]) {
    assert.equal(normalizePhoneForTel(bad), null, String(bad));
  }
});

test("a valid stay at a hotel with a phone offers a real call link", () => {
  assert.deepEqual(frontDeskFor(stay(), now), { hotelName: "Hotel X", telHref: "tel:+995322000000", displayPhone: "+995 32 200 00 00" });
});

test("no stay, an ended stay, or a hotel without a usable phone offers no call button", () => {
  assert.equal(frontDeskFor(null, now), null);
  assert.equal(frontDeskFor(stay({ checkOut: day(-1) }), now), null);
  assert.equal(frontDeskFor(stay({ expectedCheckOut: day(-1) }), now), null);
  assert.equal(frontDeskFor(stay({ phone: null }), now), null);
  assert.equal(frontDeskFor(stay({ phone: "ask at the desk" }), now), null);
  assert.equal(frontDeskFor(stay({ hotelName: "  " }), now), null);
});

test("the fallback is plain wording, not a promise of a feature", () => {
  assert.doesNotMatch(RECEPTION_FALLBACK, /prototype|connected|not available/i);
});
