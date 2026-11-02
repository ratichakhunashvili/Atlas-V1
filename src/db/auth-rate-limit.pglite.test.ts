import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";
import { isAuthAttemptAllowed, recordAuthAttempt } from "./operations/auth-rate-limit";
import { AUTH_RATE_LIMIT_RULES, authRateLimitKey } from "@/services/rate-limit/auth-policy";

/** The sign-in / sign-up throttle against an in-memory Postgres built from the checked-in migrations. */

const CHECK_VIOLATION = "23514";
const NOW = new Date("2026-03-10T12:00:00Z");

let database: TestDatabase;
before(async () => {
  database = await createTestDatabase();
});
after(async () => {
  await database.close();
});

const minutesLater = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);

describe("auth rate limit", () => {
  it("allows the 5th failed sign-in for an email and refuses the 6th", async () => {
    const keyHash = authRateLimitKey("email", "five@atlas.test");
    for (let i = 0; i < AUTH_RATE_LIMIT_RULES.sign_in_email.limit; i++) {
      assert.equal(await isAuthAttemptAllowed(database.db, { scope: "sign_in_email", keyHash, now: NOW }), true);
      await recordAuthAttempt(database.db, { scope: "sign_in_email", keyHash, now: NOW });
    }
    assert.equal(await isAuthAttemptAllowed(database.db, { scope: "sign_in_email", keyHash, now: NOW }), false);
  });

  it("lets the email try again once the window has rolled past", async () => {
    const keyHash = authRateLimitKey("email", "five@atlas.test");
    assert.equal(await isAuthAttemptAllowed(database.db, { scope: "sign_in_email", keyHash, now: minutesLater(16) }), true);
  });

  it("counts each email, and each scope, separately", async () => {
    const other = authRateLimitKey("email", "other@atlas.test");
    assert.equal(await isAuthAttemptAllowed(database.db, { scope: "sign_in_email", keyHash: other, now: NOW }), true);
    const sameKeyOtherScope = authRateLimitKey("email", "five@atlas.test");
    assert.equal(await isAuthAttemptAllowed(database.db, { scope: "sign_up_ip", keyHash: sameKeyOtherScope, now: NOW }), true);
  });

  it("treats email case and spacing as the same address", () => {
    assert.equal(authRateLimitKey("email", " Five@Atlas.test "), authRateLimitKey("email", "five@atlas.test"));
    assert.notEqual(authRateLimitKey("email", "x"), authRateLimitKey("ip", "x"));
  });

  it("stores only a hash, never the email", async () => {
    const rows = await database.db.execute(sql`select key_hash from auth_rate_limit_attempts`);
    const values = (rows as unknown as { rows: Array<{ key_hash: string }> }).rows.map((r) => r.key_hash);
    assert.ok(values.length > 0);
    for (const value of values) assert.match(value, /^[0-9a-f]{64}$/);
  });

  it("drops rows that have left the window when a new attempt is recorded", async () => {
    const keyHash = authRateLimitKey("email", "five@atlas.test");
    await recordAuthAttempt(database.db, { scope: "sign_in_email", keyHash, now: minutesLater(30) });
    const rows = await database.db.execute(
      sql`select count(*)::int as n from auth_rate_limit_attempts where key_hash = ${keyHash} and scope = 'sign_in_email'`
    );
    assert.equal((rows as unknown as { rows: Array<{ n: number }> }).rows[0]?.n, 1);
  });

  it("rejects an unknown scope at the database", async () => {
    const code = await expectSqlFailure(() =>
      database.db.execute(sql`insert into auth_rate_limit_attempts (scope, key_hash) values ('anything', 'x')`)
    );
    assert.equal(code, CHECK_VIOLATION);
  });
});
