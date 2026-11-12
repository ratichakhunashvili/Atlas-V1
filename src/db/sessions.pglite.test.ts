import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "./test-support/pglite";
import { users } from "@/db/schema";
import { revokeUserSessions } from "@/db/operations/sessions";
import { authTimeFor, sessionStanding } from "@/lib/session-standing";

/*
 * Ending sessions server-side (sign-out on every device, password reset) against an in-memory Postgres built from the
 * checked-in migrations, including 0032 (users.sessions_valid_after). Real operation, real column, real rule.
 */

const SIGNED_IN = new Date("2026-05-01T09:00:00.000Z");
const SIGNED_OUT = new Date("2026-05-01T10:00:00.400Z");

let database: TestDatabase;
before(async () => {
  database = await createTestDatabase();
});
after(async () => {
  await database.close();
});

let counter = 0;
async function addUser(role: "user" | "admin" = "user") {
  counter += 1;
  const [user] = await database.db
    .insert(users)
    .values({ email: `session-${counter}@atlas.test`, passwordHash: "x", role })
    .returning();
  return user;
}
async function account(id: string) {
  const [row] = await database.db.select().from(users).where(eq(users.id, id));
  return row ?? null;
}

describe("ending an account's sessions", () => {
  it("a new account has never had a session ended", async () => {
    const user = await addUser();
    assert.equal(user.sessionsValidAfter, null);
    assert.equal(sessionStanding({ authTime: authTimeFor(SIGNED_IN) }, user), "valid");
  });

  it("sign-out ends the token that was signed in before it, on every device", async () => {
    const user = await addUser();
    const phone = { authTime: authTimeFor(SIGNED_IN) };
    const laptop = { authTime: authTimeFor(new Date(SIGNED_IN.getTime() + 30 * 60_000)) };
    await revokeUserSessions(database.db, user.id, SIGNED_OUT);

    const row = await account(user.id);
    assert.equal(row?.sessionsValidAfter?.getTime(), SIGNED_OUT.getTime());
    assert.equal(sessionStanding(phone, row), "ended");
    assert.equal(sessionStanding(laptop, row), "ended");
  });

  it("a fresh sign-in after the sign-out is accepted, and an earlier one in the same second is not", async () => {
    const user = await addUser();
    await revokeUserSessions(database.db, user.id, SIGNED_OUT);
    const row = await account(user.id);
    assert.equal(sessionStanding({ authTime: authTimeFor(new Date(SIGNED_OUT.getTime() + 300)) }, row), "valid", "same second, after");
    assert.equal(sessionStanding({ authTime: authTimeFor(new Date(SIGNED_OUT.getTime() - 300)) }, row), "ended", "same second, before");
    assert.equal(sessionStanding({ authTime: authTimeFor(new Date(SIGNED_OUT.getTime() + 5_000)) }, row), "valid", "later");
    assert.equal(sessionStanding({ authTime: authTimeFor(new Date(SIGNED_OUT.getTime() - 1_000)) }, row), "ended", "the second before");
  });

  it("a token from before authTime existed is valid until the first revocation, then ended", async () => {
    const user = await addUser();
    const legacy = {};
    assert.equal(sessionStanding(legacy, await account(user.id)), "valid");
    assert.equal(sessionStanding({ authTime: null }, await account(user.id)), "valid");
    await revokeUserSessions(database.db, user.id, SIGNED_OUT);
    assert.equal(sessionStanding(legacy, await account(user.id)), "ended");
    assert.equal(sessionStanding({ authTime: Number.NaN }, await account(user.id)), "ended");
  });

  it("only touches the one account", async () => {
    const leaving = await addUser();
    const staying = await addUser();
    await revokeUserSessions(database.db, leaving.id, SIGNED_OUT);
    assert.equal((await account(staying.id))?.sessionsValidAfter, null);
    assert.equal(sessionStanding({ authTime: authTimeFor(SIGNED_IN) }, await account(staying.id)), "valid");
  });

  it("a deleted account's token is ended", async () => {
    const user = await addUser();
    await database.db.delete(users).where(eq(users.id, user.id));
    assert.equal(await account(user.id), null);
    assert.equal(sessionStanding({ authTime: authTimeFor(SIGNED_IN) }, null), "ended");
  });

  it("demotion is separate: the session stays valid, and the fresh row says the account is no longer an admin", async () => {
    // requireAdmin decides from this row's role (lib/authorization.test.ts checks it reads the row, not the token).
    const admin = await addUser("admin");
    const token = { authTime: authTimeFor(SIGNED_IN), role: "admin" as const };
    await database.db.update(users).set({ role: "user" }).where(eq(users.id, admin.id));
    const row = await account(admin.id);
    assert.equal(sessionStanding(token, row), "valid");
    assert.equal(row?.role, "user");
    assert.notEqual(row?.role, token.role);
  });
});
