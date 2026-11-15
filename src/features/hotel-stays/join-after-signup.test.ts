import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hotelTokenFromCallback, joinScannedHotelAfterSignup, type JoinAfterSignupDependencies } from "./join-after-signup";

const NOW = new Date("2026-11-16T09:00:00Z");
const HOTEL = { id: "hotel-1", place: { name: "Skillwill" } };

function deps(overrides: Partial<JoinAfterSignupDependencies> = {}) {
  const stays: { userId: string; hotelId: string }[] = [];
  const resolved: string[] = [];
  const d: JoinAfterSignupDependencies = {
    resolveHotel: async (token) => {
      resolved.push(token);
      return token === "GOODCODE" ? HOTEL : null;
    },
    createStay: async (input) => {
      stays.push({ userId: input.userId, hotelId: input.hotelId });
      return { id: "stay-1" };
    },
    ...overrides,
  };
  return { d, stays, resolved };
}

describe("hotelTokenFromCallback", () => {
  it("reads the code from a hotel check-in return address only", () => {
    assert.equal(hotelTokenFromCallback("/checkin/GOODCODE"), "GOODCODE");
    assert.equal(hotelTokenFromCallback("/checkin/A%2FB"), "A/B");
    assert.equal(hotelTokenFromCallback("/checkin/confirm"), null, "the switch confirmation screen is not a code");
    assert.equal(hotelTokenFromCallback("/unlock/HOTELCODE"), "HOTELCODE", "a hotel code printed with a /U/ link");
    assert.equal(hotelTokenFromCallback("/plan/unlocked"), null);
    assert.equal(hotelTokenFromCallback("/"), null);
    assert.equal(hotelTokenFromCallback(null), null);
    assert.equal(hotelTokenFromCallback("/checkin/%E0%A4%A"), null, "a broken encoding is ignored");
  });
});

describe("joinScannedHotelAfterSignup", () => {
  it("starts the new account's stay at the scanned hotel and goes on to the home page", async () => {
    const { d, stays } = deps();
    const next = await joinScannedHotelAfterSignup({ userId: "new-user", callbackUrl: "/checkin/GOODCODE", now: NOW }, d);
    assert.equal(next, "/?checkinOk=Skillwill");
    assert.deepEqual(stays, [{ userId: "new-user", hotelId: "hotel-1" }]);
  });

  it("does nothing for an invalid, revoked or expired code, so the code's page can explain it", async () => {
    const { d, stays } = deps();
    assert.equal(await joinScannedHotelAfterSignup({ userId: "new-user", callbackUrl: "/checkin/BADCODE", now: NOW }, d), null);
    assert.deepEqual(stays, []);
  });

  it("does nothing without a scanned hotel code, and never looks one up", async () => {
    const { d, stays, resolved } = deps();
    for (const callbackUrl of ["/", "/plan", "/checkin/confirm", null]) {
      assert.equal(await joinScannedHotelAfterSignup({ userId: "new-user", callbackUrl, now: NOW }, d), null);
    }
    assert.deepEqual(stays, []);
    assert.deepEqual(resolved, []);
  });

  it("a place code in an /unlock return address is looked up as a hotel code, refused, and starts nothing", async () => {
    const { d, stays } = deps();
    assert.equal(await joinScannedHotelAfterSignup({ userId: "new-user", callbackUrl: "/unlock/PLACECODE", now: NOW }, d), null);
    assert.deepEqual(stays, []);
  });

  it("a hotel code printed with a /U/ link starts the stay", async () => {
    const { d, stays } = deps();
    assert.equal(await joinScannedHotelAfterSignup({ userId: "new-user", callbackUrl: "/unlock/GOODCODE", now: NOW }, d), "/?checkinOk=Skillwill");
    assert.equal(stays.length, 1);
  });

  it("falls back to the code's page when the stay could not be written", async () => {
    const { d } = deps({ createStay: async () => null });
    assert.equal(await joinScannedHotelAfterSignup({ userId: "new-user", callbackUrl: "/checkin/GOODCODE", now: NOW }, d), null);
  });
});
