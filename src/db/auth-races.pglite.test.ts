import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "./test-support/pglite";
import { passwordResetTokens, users } from "@/db/schema";
import { revokeUserSessions } from "@/db/operations/sessions";
import { reserveAuthAttempt } from "@/db/operations/auth-rate-limit";
import { authorizeCredentials } from "@/auth/authorize";
import { completePasswordReset, requestPasswordReset } from "@/features/password-reset/core";
import { hashResetToken } from "@/features/password-reset/token";
import { passwordFingerprint } from "@/lib/password-fingerprint";
import { authTimeFor, sessionStanding } from "@/lib/session-standing";
import { AUTH_RATE_LIMIT_RULES } from "@/services/rate-limit/auth-policy";
import type { MailMessage } from "@/services/mail";

/*
 * Regression tests for the auth races found by the 2026-11-13 follow-up review, run against an in-memory Postgres built
 * from the checked-in migrations (including 0034's one-unused-token index). Each test drives the real operations in
 * the exact interleaving the review reproduced.
 */

let database: TestDatabase;
before(async () => {
  database = await createTestDatabase();
});
after(async () => {
  await database.close();
});

let counter = 0;
async function addUser(password = "Old-pass-1") {
  counter += 1;
  const email = `race-${counter}@atlas.test`;
  const [user] = await database.db
    .insert(users)
    .values({ email, passwordHash: await bcrypt.hash(password, 4), role: "user" })
    .returning();
  return user;
}
async function account(id: string) {
  const [row] = await database.db.select().from(users).where(eq(users.id, id));
  return row;
}
const standing = async (id: string, token: { authTime: number; passwordVersion?: string }) => {
  const row = await account(id);
  return sessionStanding(token, { sessionsValidAfter: row.sessionsValidAfter, passwordVersion: passwordFingerprint(row.passwordHash) });
};

describe("revocation never moves backward", () => {
  it("keeps the newer cutoff when an older revocation finishes last", async () => {
    const user = await addUser();
    const t = new Date("2026-06-01T12:00:00.000Z").getTime();
    const token = { authTime: authTimeFor(new Date(t + 150)) };

    await revokeUserSessions(database.db, user.id, new Date(t + 250)); // newer revocation lands first
    assert.equal(await standing(user.id, token), "ended");

    await revokeUserSessions(database.db, user.id, new Date(t + 100)); // delayed older one lands second
    assert.equal((await account(user.id)).sessionsValidAfter?.getTime(), t + 250, "cutoff stayed at the newer instant");
    assert.equal(await standing(user.id, token), "ended", "the revoked token did not come back");
  });

  it("still moves forward for a later revocation", async () => {
    const user = await addUser();
    await revokeUserSessions(database.db, user.id, new Date("2026-06-01T12:00:00.000Z"));
    await revokeUserSessions(database.db, user.id, new Date("2026-06-01T13:00:00.000Z"));
    assert.equal((await account(user.id)).sessionsValidAfter?.toISOString(), "2026-06-01T13:00:00.000Z");
  });
});

describe("a sign-in checking the old password cannot survive a reset", () => {
  async function issueAndReset(userId: string, email: string, newPassword: string, now: Date) {
    const mails: MailMessage[] = [];
    await requestPasswordReset(
      { db: database.db, mailer: { send: async (m) => void mails.push(m) }, now, origin: "https://atlas.test", clientKey: `client-${email}` },
      email
    );
    const token = /token=([A-Za-z0-9_-]+)/.exec(mails[0]?.text ?? "")?.[1];
    assert.ok(token, "a reset link was mailed");
    const result = await completePasswordReset(
      { db: database.db, hashPassword: (p) => bcrypt.hash(p, 4), now },
      { token, password: newPassword, confirm: newPassword }
    );
    assert.equal(result.status, "ok");
  }

  const findByEmail = async (email: string) => {
    const [row] = await database.db.select().from(users).where(eq(sql`lower(${users.email})`, email.toLowerCase()));
    return row ?? null;
  };

  it("fails when the reset completes while bcrypt is still verifying the old hash", async () => {
    const user = await addUser("Old-pass-1");
    let releaseVerify!: () => void;
    const paused = new Promise<void>((resolve) => (releaseVerify = resolve));
    let verifyStarted!: () => void;
    const started = new Promise<void>((resolve) => (verifyStarted = resolve));

    const signIn = authorizeCredentials(
      {
        findUserByEmail: findByEmail,
        verifyPassword: async (password, hash) => {
          verifyStarted();
          await paused; // the hash was already read; hold here while the reset runs
          return bcrypt.compare(password, hash);
        },
      },
      { email: user.email, password: "Old-pass-1" }
    );

    await started;
    await issueAndReset(user.id, user.email, "New-pass-2", new Date());
    releaseVerify();

    assert.equal(await signIn, null, "the resumed sign-in issued no session");

    const fresh = await authorizeCredentials({ findUserByEmail: findByEmail, verifyPassword: bcrypt.compare }, { email: user.email, password: "New-pass-2" });
    assert.ok(fresh, "the new password signs in");
    const old = await authorizeCredentials({ findUserByEmail: findByEmail, verifyPassword: bcrypt.compare }, { email: user.email, password: "Old-pass-1" });
    assert.equal(old, null, "the old password does not");
  });

  it("ends a session signed in with the old password even if the reset commits after the sign-in finished", async () => {
    const user = await addUser("Old-pass-1");
    const signedIn = await authorizeCredentials({ findUserByEmail: findByEmail, verifyPassword: bcrypt.compare }, { email: user.email, password: "Old-pass-1" });
    assert.ok(signedIn);
    // The token is stamped a little later than the reset's clock: a time cutoff alone would keep it.
    const resetAt = new Date();
    await issueAndReset(user.id, user.email, "New-pass-2", resetAt);
    const token = { authTime: resetAt.getTime() + 50, passwordVersion: signedIn.passwordVersion };
    assert.equal(await standing(user.id, token), "ended", "the password changed, so the session ended");
  });
});

describe("concurrent recovery requests", () => {
  it("leave exactly one usable link, and none after the reset", async () => {
    const user = await addUser();
    const now = new Date();
    const mails: string[] = [];
    const mailer = { send: async (m: MailMessage) => void mails.push(m.text) };
    await Promise.all(
      [1, 2, 3].map((n) =>
        requestPasswordReset({ db: database.db, mailer, now, origin: "https://atlas.test", clientKey: `burst-${n}` }, user.email)
      )
    );
    const unused = await database.db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
    assert.equal(unused.length, 1, "one unused token remains");

    const tokens = mails.map((text) => /token=([A-Za-z0-9_-]+)/.exec(text)?.[1]).filter((t): t is string => Boolean(t));
    const usable = tokens.filter((t) => unused.some((row) => row.tokenHash === hashResetToken(t)));
    assert.equal(usable.length, 1, "only one mailed link works");

    const done = await completePasswordReset(
      { db: database.db, hashPassword: (p) => bcrypt.hash(p, 4), now },
      { token: usable[0], password: "New-pass-2", confirm: "New-pass-2" }
    );
    assert.equal(done.status, "ok");
    for (const token of tokens) {
      const again = await completePasswordReset(
        { db: database.db, hashPassword: (p) => bcrypt.hash(p, 4), now },
        { token, password: "Another-3", confirm: "Another-3" }
      );
      assert.equal(again.status, "invalid_token", "no link changes the password again");
    }
  });

  it("the database refuses a second unused token for one account", async () => {
    const user = await addUser();
    const expiresAt = new Date(Date.now() + 60_000);
    await database.db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: `a-${user.id}`, expiresAt });
    await assert.rejects(database.db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: `b-${user.id}`, expiresAt }));
  });

  it("enforce the rate limit even when the requests arrive together", async () => {
    const scope = "password_reset_email" as const;
    const limit = AUTH_RATE_LIMIT_RULES[scope].limit;
    const results = await Promise.all(
      Array.from({ length: limit + 4 }, () => reserveAuthAttempt(database.db, { scope, keyHash: "burst-key", now: new Date() }))
    );
    assert.equal(results.filter(Boolean).length, limit, `exactly ${limit} pass`);
  });
});
