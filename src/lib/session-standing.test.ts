import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { authConfig } from "@/auth/config";
import { authTimeFor, sessionStanding } from "./session-standing";

const REVOKED_AT = new Date("2026-06-01T12:00:00.750Z");
const revoked = { sessionsValidAfter: REVOKED_AT };
const never = { sessionsValidAfter: null };
const ms = (date: Date) => date.getTime();

describe("sessionStanding", () => {
  it("accepts any token while no session of the account has been ended", () => {
    assert.equal(sessionStanding({ authTime: 1 }, never), "valid");
    assert.equal(sessionStanding({}, never), "valid", "a token from before authTime existed");
  });

  it("ends a token signed in before the revocation, even earlier in the same second", () => {
    assert.equal(sessionStanding({ authTime: ms(REVOKED_AT) - 1 }, revoked), "ended");
    assert.equal(sessionStanding({ authTime: ms(REVOKED_AT) - 500 }, revoked), "ended", "same second, before the sign-out");
    assert.equal(sessionStanding({ authTime: ms(REVOKED_AT) - 86_400_000 }, revoked), "ended");
  });

  it("accepts a sign-in at or after the revocation instant", () => {
    assert.equal(sessionStanding({ authTime: ms(REVOKED_AT) }, revoked), "valid");
    assert.equal(sessionStanding({ authTime: ms(REVOKED_AT) + 1 }, revoked), "valid");
  });

  it("ends a seconds-era authTime once a revocation exists", () => {
    assert.equal(sessionStanding({ authTime: Math.floor(ms(REVOKED_AT) / 1000) + 10 }, revoked), "ended");
  });

  it("ends a token without a usable authTime once a revocation exists", () => {
    assert.equal(sessionStanding({}, revoked), "ended");
    assert.equal(sessionStanding({ authTime: null }, revoked), "ended");
    assert.equal(sessionStanding({ authTime: Number.POSITIVE_INFINITY }, revoked), "ended");
  });

  it("ends every token of an account that no longer exists", () => {
    assert.equal(sessionStanding({ authTime: ms(REVOKED_AT) + 100 }, null), "ended");
  });

  it("stamps the sign-in time in milliseconds", () => {
    assert.equal(authTimeFor(REVOKED_AT), ms(REVOKED_AT));
  });
});

describe("the Auth.js token", () => {
  const jwt = authConfig.callbacks.jwt as unknown as (input: {
    token: Record<string, unknown>;
    user?: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
  const session = authConfig.callbacks.session as unknown as (input: {
    session: { user: Record<string, unknown> } & Record<string, unknown>;
    token: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;

  it("gets authTime at sign-in, and keeps it unchanged when the token is refreshed later", async () => {
    const before = ms(new Date());
    const signedIn = await jwt({ token: {}, user: { id: "u1", role: "user" } });
    const after = ms(new Date());
    assert.equal(typeof signedIn.authTime, "number");
    assert.ok((signedIn.authTime as number) >= before && (signedIn.authTime as number) <= after);

    const refreshed = await jwt({ token: { ...signedIn } });
    assert.equal(refreshed.authTime, signedIn.authTime);
    const legacy = await jwt({ token: { id: "u1", role: "user" } });
    assert.equal(legacy.authTime, undefined, "a refresh never invents a sign-in time");
  });

  it("exposes authTime on the session, and leaves it out for a legacy token", async () => {
    const withTime = await session({ session: { user: {} }, token: { id: "u1", role: "user", authTime: 123 } });
    assert.equal(withTime.authTime, 123);
    const legacy = await session({ session: { user: {} }, token: { id: "u1", role: "user" } });
    assert.equal(legacy.authTime, undefined);
  });
});
