import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AUTH_RATE_LIMIT_RULES, isWithinAuthLimit } from "./auth-policy";

describe("sign-up limit per network", () => {
  it("lets a whole group on one shared wifi sign up within the hour", () => {
    assert.deepEqual(AUTH_RATE_LIMIT_RULES.sign_up_ip, { limit: 200, windowSeconds: 3600 });
    assert.equal(isWithinAuthLimit("sign_up_ip", 20), true, "the 21st person on the same wifi is no longer refused");
    assert.equal(isWithinAuthLimit("sign_up_ip", 199), true, "the 200th attempt is allowed");
  });

  it("still stops scripted account creation", () => {
    assert.equal(isWithinAuthLimit("sign_up_ip", 200), false, "the 201st attempt in the hour is refused");
  });
});
