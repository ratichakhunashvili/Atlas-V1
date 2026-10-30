import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";
import {
  checkAttemptAllowed,
  pruneExpiredAttempts,
  recordFailedAttempt,
  reserveAttempt,
} from "./operations/rate-limit";
import { RATE_LIMIT_RULES } from "@/services/rate-limit/policy";

/**
 * The production rate-limit operations, called directly against an in-memory
 * Postgres built from the checked-in migrations — never a remote or shared
 * database.
 *
 * **PGlite serialises statements.** These tests prove the counting, the window and
 * the constraints; they do NOT prove behaviour under genuinely parallel requests.
 */

const CHECK_VIOLATION = "23514";
const FK_VIOLATION = "23503";
const NOW = new Date("2026-03-10T12:00:00Z");

let database: TestDatabase;

before(async () => {
  database = await createTestDatabase();
});

after(async () => {
  await database.close();
});

let userCounter = 0;
async function seedUser() {
  userCounter += 1;
  const [user] = await database.db
    .insert(database.schema.users)
    .values({ email: `limit-${userCounter}@example.test`, passwordHash: "x" })
    .returning();
  return user;
}

describe("migration 0008", () => {
  it("creates the attempts table", async () => {
    const result = await database.db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_name = 'rate_limit_attempts'`
    );
    assert.equal(result.rows.length, 1);
  });

  it("refuses a scope outside the approved three", async () => {
    const user = await seedUser();
    const code = await expectSqlFailure(() =>
      database.db.execute(
        sql`insert into rate_limit_attempts (scope, actor_id) values ('itinerary_generation', ${user.id})`
      )
    );
    assert.equal(code, CHECK_VIOLATION, "the database itself refuses an unapproved scope");
  });

  it("refuses an attempt with no real actor", async () => {
    const code = await expectSqlFailure(() =>
      database.db.insert(database.schema.rateLimitAttempts).values({
        scope: "hotel_entry",
        actorId: "00000000-0000-4000-8000-000000000000",
        occurredAt: NOW,
      })
    );
    assert.equal(code, FK_VIOLATION);
  });

  it("stores no credential, coordinate or stop reference", async () => {
    const result = await database.db.execute(
      sql`select column_name from information_schema.columns where table_name = 'rate_limit_attempts'`
    );
    const columns = (result.rows as Array<{ column_name: string }>).map((row) => row.column_name).sort();

    // principal_id (GuestPrincipal Stage A, nullable, unread) is an OWNER reference like actor_id — still no credential, coordinate or stop.
    assert.deepEqual(columns, ["actor_id", "id", "occurred_at", "principal_id", "scope"]);
  });
});

describe("counting failures", () => {
  it("allows attempts up to the limit and refuses the next", async () => {
    const user = await seedUser();
    const { limit } = RATE_LIMIT_RULES.hotel_entry;

    for (let attempt = 0; attempt < limit; attempt += 1) {
      const decision = await checkAttemptAllowed(database.db, {
        scope: "hotel_entry",
        actorId: user.id,
        now: NOW,
      });
      assert.equal(decision.allowed, true, `attempt ${attempt + 1} of ${limit} should be allowed`);

      await recordFailedAttempt(database.db, { scope: "hotel_entry", actorId: user.id, now: NOW });
    }

    const afterLimit = await checkAttemptAllowed(database.db, {
      scope: "hotel_entry",
      actorId: user.id,
      now: NOW,
    });
    assert.equal(afterLimit.allowed, false, "the attempt after the limit is refused");
    assert.equal(afterLimit.allowed === false && afterLimit.retryAfterSeconds, 900);
  });

  it("counts each scope separately — check-in failures do not lock a guest out of hotel entry", async () => {
    const user = await seedUser();

    for (let attempt = 0; attempt < RATE_LIMIT_RULES.hotel_entry.limit; attempt += 1) {
      await recordFailedAttempt(database.db, { scope: "hotel_entry", actorId: user.id, now: NOW });
    }

    const entry = await checkAttemptAllowed(database.db, { scope: "hotel_entry", actorId: user.id, now: NOW });
    const checkIn = await checkAttemptAllowed(database.db, { scope: "place_check_in", actorId: user.id, now: NOW });

    assert.equal(entry.allowed, false);
    assert.equal(checkIn.allowed, true, "a different scope keeps its own allowance");
  });

  it("counts each actor separately, so nobody can spend another guest's allowance", async () => {
    const victim = await seedUser();
    const other = await seedUser();

    for (let attempt = 0; attempt < RATE_LIMIT_RULES.hotel_entry.limit; attempt += 1) {
      await recordFailedAttempt(database.db, { scope: "hotel_entry", actorId: other.id, now: NOW });
    }

    const victimDecision = await checkAttemptAllowed(database.db, {
      scope: "hotel_entry",
      actorId: victim.id,
      now: NOW,
    });
    assert.equal(victimDecision.allowed, true, "this throttles; it must never become a lockout weapon");
  });

  it("forgets attempts once they roll out of the window", async () => {
    const user = await seedUser();
    const { limit, windowSeconds } = RATE_LIMIT_RULES.hotel_entry;

    for (let attempt = 0; attempt < limit; attempt += 1) {
      await recordFailedAttempt(database.db, { scope: "hotel_entry", actorId: user.id, now: NOW });
    }

    const blocked = await checkAttemptAllowed(database.db, { scope: "hotel_entry", actorId: user.id, now: NOW });
    assert.equal(blocked.allowed, false);

    const afterWindow = new Date(NOW.getTime() + (windowSeconds + 1) * 1000);
    const recovered = await checkAttemptAllowed(database.db, {
      scope: "hotel_entry",
      actorId: user.id,
      now: afterWindow,
    });
    assert.equal(recovered.allowed, true, "the window rolls; nothing has to be unlocked by hand");
  });

  it("still counts an attempt exactly at the window edge", async () => {
    const user = await seedUser();
    const { limit, windowSeconds } = RATE_LIMIT_RULES.hotel_entry;

    const atEdge = new Date(NOW.getTime() - windowSeconds * 1000);
    for (let attempt = 0; attempt < limit; attempt += 1) {
      await recordFailedAttempt(database.db, { scope: "hotel_entry", actorId: user.id, now: atEdge });
    }

    const decision = await checkAttemptAllowed(database.db, { scope: "hotel_entry", actorId: user.id, now: NOW });
    assert.equal(decision.allowed, false, "the window boundary is inclusive, matching windowStart()");
  });
});

describe("reserving an attempt (counts every operation)", () => {
  it("records as it allows, and refuses past the limit", async () => {
    const admin = await seedUser();
    const { limit } = RATE_LIMIT_RULES.qr_credential_issue;

    for (let attempt = 0; attempt < limit; attempt += 1) {
      const decision = await reserveAttempt(database.db, {
        scope: "qr_credential_issue",
        actorId: admin.id,
        now: NOW,
      });
      assert.equal(decision.allowed, true, `operation ${attempt + 1} should be allowed`);
    }

    const refused = await reserveAttempt(database.db, {
      scope: "qr_credential_issue",
      actorId: admin.id,
      now: NOW,
    });
    assert.equal(refused.allowed, false, "successful rotations are counted, so this is not an unthrottled loop");

    const rows = await database.db
      .select()
      .from(database.schema.rateLimitAttempts)
      .where(eq(database.schema.rateLimitAttempts.actorId, admin.id));
    assert.equal(rows.length, limit, "a refused reservation records nothing extra");
  });
});

describe("housekeeping", () => {
  it("prunes only attempts that can no longer affect a decision", async () => {
    const user = await seedUser();
    const { windowSeconds } = RATE_LIMIT_RULES.hotel_entry;

    const old = new Date(NOW.getTime() - (windowSeconds + 60) * 1000);
    await recordFailedAttempt(database.db, { scope: "hotel_entry", actorId: user.id, now: old });
    await recordFailedAttempt(database.db, { scope: "hotel_entry", actorId: user.id, now: NOW });

    await pruneExpiredAttempts(database.db, { scope: "hotel_entry", actorId: user.id, now: NOW });

    const rows = await database.db
      .select()
      .from(database.schema.rateLimitAttempts)
      .where(eq(database.schema.rateLimitAttempts.actorId, user.id));

    assert.equal(rows.length, 1, "the in-window attempt survives");
    assert.equal(rows[0].occurredAt.toISOString(), NOW.toISOString());
  });

  it("takes an actor's attempts with them when the account goes", async () => {
    const user = await seedUser();
    await recordFailedAttempt(database.db, { scope: "hotel_entry", actorId: user.id, now: NOW });

    await database.db.delete(database.schema.users).where(eq(database.schema.users.id, user.id));

    const rows = await database.db
      .select()
      .from(database.schema.rateLimitAttempts)
      .where(eq(database.schema.rateLimitAttempts.actorId, user.id));
    assert.deepEqual(rows, []);
  });
});
