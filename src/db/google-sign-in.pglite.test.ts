import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { authorizeCredentials } from "@/auth/authorize";
import { authConfig } from "@/auth/config";
import { googleSessionUser } from "@/auth/google";
import { passwordFingerprint } from "@/lib/password-fingerprint";
import { sessionStanding } from "@/lib/session-standing";
import { deleteGuestAccount } from "./operations/account-deletion";
import { gatherAccountExport } from "./operations/account-export";
import { findGoogleLinkedAccount, resolveGoogleSignIn } from "./operations/google-sign-in";
import { consumeResetToken } from "./operations/password-reset";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";

/*
 * Phase 3, sign-in with Google, against the real migrations: who gets signed in, joined or created, what is refused,
 * and what a Google-only account (no password) means for password sign-in, password reset, export and deletion.
 */

let database: TestDatabase;
before(async () => {
  database = await createTestDatabase();
});
after(async () => {
  await database.close();
});

// auth/password.ts is server-only; the same bcrypt calls, with fewer rounds to keep the tests quick.
const hashPassword = (password: string) => bcrypt.hash(password, 4);
const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

const NOW = new Date("2026-11-13T12:00:00Z");
let counter = 0;
const unique = (label: string) => `${label}-${++counter}`;
const claims = (sub: string, email: string, emailVerified: unknown = true) => ({ sub, email, emailVerified });

async function addPasswordUser(email: string, role: "user" | "admin" = "user", password = "Old-pass-123") {
  const { db, schema } = database;
  const [user] = await db.insert(schema.users).values({ email, passwordHash: await hashPassword(password), role }).returning();
  return user;
}
async function userRow(id: string) {
  const { db, schema } = database;
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  return row;
}
async function identitiesOf(userId: string) {
  const { db, schema } = database;
  return db.select().from(schema.userIdentities).where(eq(schema.userIdentities.userId, userId));
}
const findByEmail = async (email: string) => {
  const { db, schema } = database;
  const [row] = await db.select().from(schema.users).where(eq(schema.users.email, email.trim().toLowerCase()));
  return row ?? null;
};

describe("user_identities: the database holds the rules", () => {
  it("one Atlas account per Google account, one Google account per Atlas account, google only", async () => {
    const { db, schema } = database;
    const a = await addPasswordUser(`${unique("ua")}@example.test`);
    const b = await addPasswordUser(`${unique("ub")}@example.test`);
    await db.insert(schema.userIdentities).values({ userId: a.id, provider: "google", providerAccountId: "sub-x" });
    await expectSqlFailure(() => db.insert(schema.userIdentities).values({ userId: b.id, provider: "google", providerAccountId: "sub-x" }));
    await expectSqlFailure(() => db.insert(schema.userIdentities).values({ userId: a.id, provider: "google", providerAccountId: "sub-y" }));
    await expectSqlFailure(() => db.insert(schema.userIdentities).values({ userId: b.id, provider: "apple" as "google", providerAccountId: "sub-z" }));
    await expectSqlFailure(() => db.insert(schema.userIdentities).values({ userId: b.id, provider: "google", providerAccountId: "" }));
  });
});

describe("resolveGoogleSignIn", () => {
  it("creates a guest account with no password and no name on a first sign-in with a verified email", async () => {
    const email = `${unique("new")}@gmail.test`;
    const result = await resolveGoogleSignIn(database.db, claims("sub-new-1", ` ${email.toUpperCase()} `), NOW);
    assert.equal(result.ok, true);
    assert.ok(result.ok && result.outcome === "created_account");
    const row = await userRow(result.ok ? result.userId : "");
    assert.equal(row.email, email, "stored trimmed and lower-case");
    assert.equal(row.role, "user");
    assert.equal(row.passwordHash, null);
    assert.equal(row.name, null);
    assert.deepEqual((await identitiesOf(row.id)).map((i) => [i.provider, i.providerAccountId]), [["google", "sub-new-1"]]);
  });

  it("signs the same Google account in to the same Atlas account, by its id, even if its email changed", async () => {
    const first = await resolveGoogleSignIn(database.db, claims("sub-same", `${unique("same")}@gmail.test`), NOW);
    const again = await resolveGoogleSignIn(database.db, claims("sub-same", `${unique("renamed")}@gmail.test`, false), NOW);
    assert.ok(first.ok && again.ok);
    assert.equal(again.userId, first.userId);
    assert.equal(again.outcome, "signed_in");
    assert.equal((await identitiesOf(first.userId)).length, 1);
  });

  it("creates and joins nothing on an unverified email, or a missing or malformed one", async () => {
    const email = `${unique("unverified")}@gmail.test`;
    for (const emailVerified of [false, undefined, null, "true", 1]) {
      assert.deepEqual(
        await resolveGoogleSignIn(database.db, { sub: "sub-unverified", email, emailVerified }, NOW),
        { ok: false, reason: "email_unverified" },
        String(emailVerified)
      );
    }
    assert.equal(await findByEmail(email), null);
    assert.deepEqual(await resolveGoogleSignIn(database.db, claims("sub-bad", "not-an-email"), NOW), { ok: false, reason: "invalid_profile" });
    assert.deepEqual(await resolveGoogleSignIn(database.db, { sub: "", email, emailVerified: true }, NOW), { ok: false, reason: "invalid_profile" });
    assert.deepEqual(await resolveGoogleSignIn(database.db, { sub: 42, email, emailVerified: true }, NOW), { ok: false, reason: "invalid_profile" });
  });

  it("joins a password account with the same email: the old password stops working and every session ends", async () => {
    const email = `${unique("joined")}@gmail.test`;
    const user = await addPasswordUser(email);
    const result = await resolveGoogleSignIn(database.db, claims("sub-joined", email), NOW);
    assert.deepEqual(result, { ok: true, userId: user.id, outcome: "joined_existing_account" });

    const row = await userRow(user.id);
    assert.equal(row.passwordHash, null, "the password whoever made the account knew is gone");
    assert.equal(row.sessionsValidAfter?.getTime(), NOW.getTime(), "sessions signed in before the join are over");
    assert.equal(
      await authorizeCredentials({ findUserByEmail: findByEmail, verifyPassword }, { email, password: "Old-pass-123" }),
      null,
      "the old password no longer signs in"
    );
    // A session from before the join (with the old password) is ended; the Google session stamped after it is valid.
    const before = { authTime: NOW.getTime() - 1, passwordVersion: passwordFingerprint(user.passwordHash) ?? undefined };
    const accountNow = { sessionsValidAfter: row.sessionsValidAfter, passwordVersion: passwordFingerprint(row.passwordHash) };
    assert.equal(sessionStanding(before, accountNow), "ended");
    assert.equal(sessionStanding({ authTime: NOW.getTime() }, accountNow), "valid");
  });

  it("never signs in to, joins or creates an admin account", async () => {
    const { db, schema } = database;
    const adminEmail = `${unique("admin")}@gmail.test`;
    const admin = await addPasswordUser(adminEmail, "admin");
    assert.deepEqual(await resolveGoogleSignIn(db, claims("sub-admin", adminEmail), NOW), { ok: false, reason: "admin_account" });
    const row = await userRow(admin.id);
    assert.notEqual(row.passwordHash, null, "the admin keeps their password");
    assert.equal(row.sessionsValidAfter, null);
    assert.equal((await identitiesOf(admin.id)).length, 0);

    // A guest who joined Google and is promoted later: Google signs them in no more.
    const guestEmail = `${unique("promoted")}@gmail.test`;
    const created = await resolveGoogleSignIn(db, claims("sub-promoted", guestEmail), NOW);
    assert.ok(created.ok);
    await db.update(schema.users).set({ role: "admin" }).where(eq(schema.users.id, created.userId));
    assert.deepEqual(await resolveGoogleSignIn(db, claims("sub-promoted", guestEmail), NOW), { ok: false, reason: "admin_account" });
  });

  it("never swaps an account's Google account for another one with the same email", async () => {
    const email = `${unique("swap")}@gmail.test`;
    const first = await resolveGoogleSignIn(database.db, claims("sub-first", email), NOW);
    assert.ok(first.ok);
    assert.deepEqual(await resolveGoogleSignIn(database.db, claims("sub-second", email), NOW), { ok: false, reason: "other_google_account" });
    assert.deepEqual((await identitiesOf(first.userId)).map((i) => i.providerAccountId), ["sub-first"]);
  });

  it("two first sign-ins at once make one account and one link", async () => {
    const email = `${unique("race")}@gmail.test`;
    const results = await Promise.all([1, 2, 3].map(() => resolveGoogleSignIn(database.db, claims("sub-race", email), NOW)));
    const ids = new Set(results.map((result) => (result.ok ? result.userId : result.reason)));
    assert.equal(ids.size, 1, JSON.stringify(results));
    const user = await findByEmail(email);
    assert.ok(user);
    assert.equal((await identitiesOf(user.id)).length, 1);
  });
});

describe("the session after a Google sign-in", () => {
  it("carries the Atlas account id, never Google's, and is marked as a Google session", async () => {
    const result = await resolveGoogleSignIn(database.db, claims("sub-token", `${unique("token")}@gmail.test`), NOW);
    assert.ok(result.ok);
    const user = await googleSessionUser((sub) => findGoogleLinkedAccount(database.db, sub), "sub-token");
    assert.ok(user);
    const token = await authConfig.callbacks.jwt({ token: { id: "", role: "user" }, user } as unknown as Parameters<typeof authConfig.callbacks.jwt>[0]);
    assert.equal(token?.id, result.userId);
    assert.notEqual(token?.id, "sub-token");
    assert.equal(token?.role, "user");
    assert.equal(token?.authMethod, "google");
    assert.equal(token?.passwordVersion, undefined, "a Google-only account has no password version");
  });

  it("ends the sign-in when the Google account is not linked, or the account is an admin", async () => {
    assert.equal(await googleSessionUser((sub) => findGoogleLinkedAccount(database.db, sub), "sub-never-seen"), null);
    assert.equal(await googleSessionUser(async () => ({ id: "x", email: "x@example.test", role: "admin", passwordHash: null }), "sub-admin"), null);
  });

  it("a password sign-in is marked as a password session", async () => {
    const email = `${unique("pw")}@example.test`;
    await addPasswordUser(email, "user", "Right-pass-1");
    const user = await authorizeCredentials({ findUserByEmail: findByEmail, verifyPassword }, { email, password: "Right-pass-1" });
    assert.equal(user?.authMethod, "password");
  });
});

describe("an account without a password", () => {
  it("cannot sign in with a password, and bcrypt is never asked about it", async () => {
    const email = `${unique("nopw")}@gmail.test`;
    assert.ok((await resolveGoogleSignIn(database.db, claims("sub-nopw", email), NOW)).ok);
    let verifyCalls = 0;
    const verify = async (password: string, hash: string) => {
      verifyCalls += 1;
      return verifyPassword(password, hash);
    };
    assert.equal(await authorizeCredentials({ findUserByEmail: findByEmail, verifyPassword: verify }, { email, password: "Anything-123" }), null);
    assert.equal(verifyCalls, 0);
  });

  it("can set a password through Forgot password, which ends the Google sessions and then signs in", async () => {
    const { db, schema } = database;
    const email = `${unique("reset")}@gmail.test`;
    const created = await resolveGoogleSignIn(db, claims("sub-reset", email), NOW);
    assert.ok(created.ok);
    await db.insert(schema.passwordResetTokens).values({ userId: created.userId, tokenHash: "reset-hash-google", expiresAt: new Date(NOW.getTime() + 600_000) });
    const later = new Date(NOW.getTime() + 60_000);
    assert.deepEqual(await consumeResetToken(db, { tokenHash: "reset-hash-google", passwordHash: await hashPassword("New-pass-123"), now: later }), { ok: true });

    const row = await userRow(created.userId);
    assert.equal(sessionStanding({ authTime: NOW.getTime() }, { sessionsValidAfter: row.sessionsValidAfter, passwordVersion: passwordFingerprint(row.passwordHash) }), "ended");
    const signedIn = await authorizeCredentials({ findUserByEmail: findByEmail, verifyPassword }, { email, password: "New-pass-123" });
    assert.equal(signedIn?.id, created.userId);
  });

  it("is exported as signing in with Google and without a password, with no Google id and no hash", async () => {
    const created = await resolveGoogleSignIn(database.db, claims("sub-export-secret-id", `${unique("export")}@gmail.test`), NOW);
    assert.ok(created.ok);
    const data = await gatherAccountExport(database.db, created.userId, NOW);
    assert.ok(data);
    assert.equal(data.signIn.password, false);
    assert.deepEqual(data.signIn.connectedAccounts.map((account) => account.provider), ["google"]);
    const text = JSON.stringify(data);
    for (const forbidden of ["sub-export-secret-id", "passwordHash", "providerAccountId"]) assert.ok(!text.includes(forbidden), forbidden);

    const withPassword = await addPasswordUser(`${unique("export-pw")}@example.test`);
    const other = await gatherAccountExport(database.db, withPassword.id, NOW);
    assert.deepEqual(other?.signIn, { password: true, connectedAccounts: [] });
  });

  it("is deleted with its Google link", async () => {
    const created = await resolveGoogleSignIn(database.db, claims("sub-delete", `${unique("delete")}@gmail.test`), NOW);
    assert.ok(created.ok);
    assert.deepEqual(await deleteGuestAccount(database.db, created.userId), { ok: true });
    assert.equal((await identitiesOf(created.userId)).length, 0);
    assert.equal(await findGoogleLinkedAccount(database.db, "sub-delete"), null);
  });
});
