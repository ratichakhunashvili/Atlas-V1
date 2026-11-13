import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "./test-support/pglite";
import { users, passwordResetTokens } from "@/db/schema";
import { completePasswordReset, GENERIC_SENT_MESSAGE, requestPasswordReset } from "@/features/password-reset/core";
import { hashResetToken, RESET_TOKEN_TTL_MS } from "@/features/password-reset/token";
import { getMailer, isMailConfigured, type Mailer } from "@/services/mail";
import { createOutboxMailer } from "@/services/mail/outbox";
import { createResendMailer } from "@/services/mail/resend";
import { AUTH_RATE_LIMIT_RULES } from "@/services/rate-limit/auth-policy";
import { authTimeFor, sessionStanding } from "@/lib/session-standing";

/* Password reset against an in-memory Postgres built from the checked-in migrations. Real operations, real SQL. */

const NOW = new Date("2026-03-10T12:00:00Z");
const ORIGIN = "https://atlas.example";
const OLD_PASSWORD = "oldpass123";
const hashPassword = (password: string) => bcrypt.hash(password, 4);

let database: TestDatabase;
let outbox: string;
let mailer: Mailer;
before(async () => {
  database = await createTestDatabase();
  outbox = await mkdtemp(path.join(os.tmpdir(), "atlas-outbox-"));
  mailer = createOutboxMailer(outbox);
});
after(async () => {
  await database.close();
  await rm(outbox, { recursive: true, force: true });
});

async function addUser(email: string) {
  const [user] = await database.db.insert(users).values({ email, passwordHash: await hashPassword(OLD_PASSWORD) }).returning();
  return user;
}
async function passwordWorks(userId: string, password: string) {
  const [row] = await database.db.select().from(users).where(eq(users.id, userId));
  return row.passwordHash !== null && bcrypt.compare(password, row.passwordHash);
}
async function messagesFor(email: string) {
  const files = await readdir(outbox);
  const all = await Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(outbox, f), "utf8")) as { to: string; text: string }));
  return all.filter((m) => m.to === email);
}
function request(email: string, over: { now?: Date; mailer?: Mailer | null; clientKey?: string } = {}) {
  return requestPasswordReset(
    { db: database.db, mailer: over.mailer === undefined ? mailer : over.mailer, now: over.now ?? NOW, origin: ORIGIN, clientKey: over.clientKey ?? "ip-default" },
    email
  );
}
/** Pulls the token out of the emailed link, as a guest clicking it would. */
async function latestToken(email: string) {
  const messages = await messagesFor(email);
  const match = /\/reset-password\?token=([A-Za-z0-9_-]{43})/.exec(messages.at(-1)?.text ?? "");
  assert.ok(match, "an email with a reset link was written");
  return match[1];
}
const complete = (token: string, password: string, confirm = password, now = NOW) =>
  completePasswordReset({ db: database.db, hashPassword, now }, { token, password, confirm });

describe("requesting a reset", () => {
  it("answers the same for a known and an unknown address, and mails only the known one", async () => {
    await addUser("known@atlas.test");
    const known = await request("known@atlas.test", { clientKey: "ip-a" });
    const unknown = await request("nobody@atlas.test", { clientKey: "ip-b" });
    assert.deepEqual(known, { status: "sent" });
    assert.deepEqual(unknown, known);
    assert.equal((await messagesFor("known@atlas.test")).length, 1);
    assert.equal((await messagesFor("nobody@atlas.test")).length, 0);
    assert.match(GENERIC_SENT_MESSAGE, /If an account exists/);
  });

  it("writes an outbox email whose link token hashes to the stored hash", async () => {
    const user = await addUser("hash@atlas.test");
    await request("Hash@Atlas.test ", { clientKey: "ip-c" });
    const token = await latestToken("hash@atlas.test");
    const rows = await database.db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].tokenHash, hashResetToken(token));
    assert.notEqual(rows[0].tokenHash, token);
    assert.equal(rows[0].expiresAt.getTime(), NOW.getTime() + RESET_TOKEN_TTL_MS);
    const [message] = await messagesFor("hash@atlas.test");
    assert.ok(message.text.includes(`${ORIGIN}/reset-password?token=`));
  });

  it("rejects an invalid email without sending", async () => {
    const result = await request("not-an-email", { clientKey: "ip-d" });
    assert.equal(result.status, "invalid");
  });

  it("is unavailable, and sends nothing, when mail is not configured", async () => {
    await addUser("nomail@atlas.test");
    const result = await request("nomail@atlas.test", { mailer: null, clientKey: "ip-e" });
    assert.deepEqual(result, { status: "unavailable" });
    assert.equal((await messagesFor("nomail@atlas.test")).length, 0);
    assert.equal(isMailConfigured({}), false);
    assert.equal(isMailConfigured({ RESEND_API_KEY: "k" }), false);
  });

  it("rate-limits per address, identically for known and unknown accounts", async () => {
    await addUser("limited@atlas.test");
    const limit = AUTH_RATE_LIMIT_RULES.password_reset_email.limit;
    for (const email of ["limited@atlas.test", "ghost@atlas.test"]) {
      for (let i = 0; i < limit; i++) assert.equal((await request(email, { clientKey: `ip-${email}-${i}` })).status, "sent");
      assert.equal((await request(email, { clientKey: `ip-${email}-x` })).status, "rate_limited");
    }
    // Rolls past the window.
    assert.equal((await request("limited@atlas.test", { now: new Date(NOW.getTime() + 61 * 60_000), clientKey: "ip-late" })).status, "sent");
  });

  it("rate-limits per client address", async () => {
    const limit = AUTH_RATE_LIMIT_RULES.password_reset_ip.limit;
    for (let i = 0; i < limit; i++) assert.equal((await request(`spray${i}@atlas.test`, { clientKey: "ip-spray" })).status, "sent");
    assert.equal((await request("spray-more@atlas.test", { clientKey: "ip-spray" })).status, "rate_limited");
  });

  it("a new request invalidates the older unused link", async () => {
    await addUser("twice@atlas.test");
    await request("twice@atlas.test", { clientKey: "ip-f" });
    const first = await latestToken("twice@atlas.test");
    await new Promise((r) => setTimeout(r, 5));
    await request("twice@atlas.test", { clientKey: "ip-g" });
    const second = await latestToken("twice@atlas.test");
    assert.notEqual(first, second);
    assert.deepEqual(await complete(first, "newpass123"), { status: "invalid_token" });
    assert.deepEqual(await complete(second, "newpass123"), { status: "ok" });
  });
});

describe("completing a reset", () => {
  it("changes the password: old stops working, new works, token is single use", async () => {
    const user = await addUser("change@atlas.test");
    await request("change@atlas.test", { clientKey: "ip-h" });
    const token = await latestToken("change@atlas.test");
    assert.deepEqual(await complete(token, "brandnew123"), { status: "ok" });
    assert.equal(await passwordWorks(user.id, OLD_PASSWORD), false);
    assert.equal(await passwordWorks(user.id, "brandnew123"), true);
    // Reuse is rejected and does not change the password again.
    assert.deepEqual(await complete(token, "another123"), { status: "invalid_token" });
    assert.equal(await passwordWorks(user.id, "brandnew123"), true);
  });

  it("ends every session signed in before the reset, in the same change, and leaves other accounts alone", async () => {
    const user = await addUser("sessions@atlas.test");
    const bystander = await addUser("bystander@atlas.test");
    const signedInEarlier = { authTime: authTimeFor(new Date(NOW.getTime() - 60_000)) };
    await request("sessions@atlas.test", { clientKey: "ip-m" });
    const token = await latestToken("sessions@atlas.test");
    const readAccount = async (id: string) => (await database.db.select().from(users).where(eq(users.id, id)))[0];

    // A failed attempt (weak password) ends nothing.
    assert.equal((await complete(token, "short")).status, "invalid");
    assert.equal((await readAccount(user.id)).sessionsValidAfter, null);

    assert.deepEqual(await complete(token, "brandnew123"), { status: "ok" });
    const account = await readAccount(user.id);
    assert.equal(account.sessionsValidAfter?.getTime(), NOW.getTime());
    assert.equal(sessionStanding(signedInEarlier, account), "ended", "the attacker's or old device's session is over");
    assert.equal(sessionStanding({ authTime: authTimeFor(NOW) }, account), "valid", "signing in with the new password works");
    assert.equal((await readAccount(bystander.id)).sessionsValidAfter, null);
  });

  it("only one of two simultaneous attempts succeeds", async () => {
    await addUser("race@atlas.test");
    await request("race@atlas.test", { clientKey: "ip-i" });
    const token = await latestToken("race@atlas.test");
    const results = await Promise.all([complete(token, "racepass111"), complete(token, "racepass222")]);
    assert.equal(results.filter((r) => r.status === "ok").length, 1);
  });

  it("rejects an expired token and leaves the password alone", async () => {
    const user = await addUser("expired@atlas.test");
    await request("expired@atlas.test", { clientKey: "ip-j" });
    const token = await latestToken("expired@atlas.test");
    const late = new Date(NOW.getTime() + RESET_TOKEN_TTL_MS + 1000);
    assert.deepEqual(await complete(token, "brandnew123", "brandnew123", late), { status: "invalid_token" });
    assert.equal(await passwordWorks(user.id, OLD_PASSWORD), true);
  });

  it("rejects missing, malformed and unknown tokens", async () => {
    assert.deepEqual(await complete("", "brandnew123"), { status: "invalid_token" });
    assert.deepEqual(await complete("short", "brandnew123"), { status: "invalid_token" });
    assert.deepEqual(await complete("A".repeat(43), "brandnew123"), { status: "invalid_token" });
  });

  it("rejects a mismatch or weak password without consuming the token", async () => {
    const user = await addUser("weak@atlas.test");
    await request("weak@atlas.test", { clientKey: "ip-k" });
    const token = await latestToken("weak@atlas.test");
    const mismatch = await complete(token, "brandnew123", "different123");
    assert.equal(mismatch.status, "invalid");
    assert.ok(mismatch.status === "invalid" && mismatch.fieldErrors.confirm);
    const weak = await complete(token, "short");
    assert.equal(weak.status, "invalid");
    const noDigit = await complete(token, "onlyletters");
    assert.equal(noDigit.status, "invalid");
    assert.equal(await passwordWorks(user.id, OLD_PASSWORD), true);
    assert.deepEqual(await complete(token, "brandnew123"), { status: "ok" });
  });

  it("deleting the user deletes their tokens", async () => {
    const user = await addUser("gone@atlas.test");
    await request("gone@atlas.test", { clientKey: "ip-l" });
    await database.db.delete(users).where(eq(users.id, user.id));
    const rows = await database.db.select().from(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id));
    assert.equal(rows.length, 0);
  });
});

describe("mail configuration", () => {
  it("prefers the outbox, then Resend, otherwise none", () => {
    // The outbox counts only on a local/development/qa deployment (services/mail/recovery-config.test.ts covers the rest).
    assert.ok(getMailer({ ATLAS_MAIL_OUTBOX_DIR: "x", ATLAS_DEPLOYMENT_ENV: "qa" }));
    assert.equal(getMailer({ ATLAS_MAIL_OUTBOX_DIR: "x" }), null);
    assert.ok(getMailer({ RESEND_API_KEY: "k", MAIL_FROM: "Atlas <a@b.c>" }));
    assert.equal(getMailer({}), null);
    assert.equal(getMailer({ MAIL_FROM: "a@b.c" }), null);
  });

  it("Resend mailer posts the message and throws on a provider error", async () => {
    let seen: { url: string; body: string; auth: string } | undefined;
    const ok = createResendMailer({ apiKey: "key", from: "Atlas <a@b.c>" }, (async (url: string, init: RequestInit) => {
      seen = { url, body: String(init.body), auth: (init.headers as Record<string, string>).Authorization };
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch);
    await ok.send({ to: "x@y.z", subject: "s", text: "t" });
    assert.equal(seen?.url, "https://api.resend.com/emails");
    assert.equal(seen?.auth, "Bearer key");
    assert.equal(JSON.parse(seen!.body).to[0], "x@y.z");
    const bad = createResendMailer({ apiKey: "key", from: "f" }, (async () => new Response("no", { status: 500 })) as unknown as typeof fetch);
    await assert.rejects(() => bad.send({ to: "x@y.z", subject: "s", text: "t" }));
  });
});
