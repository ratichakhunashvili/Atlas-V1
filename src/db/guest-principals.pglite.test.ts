import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";
import { backfillGuestPrincipals, verifyPrincipalBackfill } from "./operations/guest-principals";

/**
 * GuestPrincipal Stage A against the real migrations (0019): the structure is purely additive, the backfill gives every
 * existing account one principal and points every owned row at it, and re-running it changes nothing.
 */

const UNIQUE_VIOLATION = "23505";
let database: TestDatabase;
let guestA: string;
let guestB: string;
let hotelId: string;

before(async () => {
  database = await createTestDatabase();
  const { db, schema } = database;

  const [a] = await db.insert(schema.users).values({ email: "principal-a@example.test", passwordHash: "x" }).returning();
  const [b] = await db.insert(schema.users).values({ email: "principal-b@example.test", passwordHash: "x" }).returning();
  guestA = a.id;
  guestB = b.id;

  const [hotelPlace] = await db.insert(schema.places).values({ name: "[Test] Principal Hotel", latitude: 41.7, longitude: 44.8, category: "hotel" }).returning();
  const [spot] = await db.insert(schema.places).values({ name: "[Test] Principal Spot", latitude: 41.71, longitude: 44.81, category: "restaurant" }).returning();
  const [hotel] = await db.insert(schema.hotels).values({ placeId: hotelPlace.id }).returning();
  hotelId = hotel.id;

  // Rows that exist BEFORE any principal does: exactly the situation of today's data.
  await db.insert(schema.hotelStays).values([
    { userId: guestA, hotelId, checkIn: new Date("2026-10-18T09:00:00Z") },
    { userId: guestB, hotelId, checkIn: new Date("2026-10-18T09:00:00Z") },
  ]);
  await db.insert(schema.userPreferences).values({ userId: guestA, categories: ["restaurant"] });
  await db.insert(schema.itineraryDays).values({ userId: guestA, hotelId, dayNumber: 1, stopCount: 0, generatedAt: new Date() });
  await db.insert(schema.placeVisits).values({
    userId: guestA,
    placeId: spot.id,
    firstVisitedAt: new Date(),
    lastVisitedAt: new Date(),
    firstVerificationMethod: "gps",
  });
  await db.insert(schema.rateLimitAttempts).values({ scope: "hotel_entry", actorId: guestB });
});

after(async () => {
  await database.close();
});

describe("Stage A structure is additive", () => {
  it("adds nullable principal columns and leaves user_id as the owner, so existing rows are untouched", async () => {
    const { db, schema } = database;
    const [stay] = await db.select().from(schema.hotelStays).where(eq(schema.hotelStays.userId, guestA));
    assert.equal(stay.principalId, null, "nothing is backfilled by the migration itself");
    assert.equal(stay.userId, guestA);
  });

  it("starts with no principals and no sessions", async () => {
    const { db, schema } = database;
    assert.equal((await db.select().from(schema.guestPrincipals)).length, 0);
    assert.equal((await db.select().from(schema.guestSessions)).length, 0);
  });

  it("a verify before the backfill reports exactly what is missing", async () => {
    const report = await verifyPrincipalBackfill(database.db);
    assert.equal(report.clean, false);
    assert.equal(report.usersWithoutPrincipal, 2);
    assert.equal(report.tables.find((entry) => entry.table === "hotel_stays")?.missingPrincipal, 2);
  });
});

describe("the backfill", () => {
  it("gives every existing account exactly one principal and points every owned row at its owner's", async () => {
    const { db, schema } = database;
    const result = await backfillGuestPrincipals(db);
    assert.equal(result.principalsCreated, 2);

    const principals = await db.select().from(schema.guestPrincipals);
    assert.deepEqual(principals.map((p) => p.userId).sort(), [guestA, guestB].sort());
    assert.ok(principals.every((p) => p.linkedAt !== null), "existing accounts are LINKED principals, not anonymous");

    const report = await verifyPrincipalBackfill(db);
    assert.deepEqual(report, { ...report, clean: true, usersWithoutPrincipal: 0 });
    for (const entry of report.tables) {
      assert.equal(entry.missingPrincipal, 0, entry.table);
      assert.equal(entry.principalDisagreesWithOwner, 0, entry.table);
    }
  });

  it("never reassigns ownership: a guest's rows point at THEIR principal, not another's", async () => {
    const { db, schema } = database;
    const [principalA] = await db.select().from(schema.guestPrincipals).where(eq(schema.guestPrincipals.userId, guestA));
    const [principalB] = await db.select().from(schema.guestPrincipals).where(eq(schema.guestPrincipals.userId, guestB));
    const stays = await db.select().from(schema.hotelStays);
    assert.equal(stays.find((s) => s.userId === guestA)?.principalId, principalA.id);
    assert.equal(stays.find((s) => s.userId === guestB)?.principalId, principalB.id);
    assert.notEqual(principalA.id, principalB.id);
  });

  it("is idempotent: a second run creates nothing and rewrites nothing", async () => {
    const { db, schema } = database;
    const before = await db.select().from(schema.hotelStays);
    const result = await backfillGuestPrincipals(db);
    assert.equal(result.principalsCreated, 0);
    assert.deepEqual(await db.select().from(schema.hotelStays), before);
  });

  it("picks up an account created afterwards, and leaves the already-filled rows alone", async () => {
    const { db, schema } = database;
    const [late] = await db.insert(schema.users).values({ email: "principal-late@example.test", passwordHash: "x" }).returning();
    await db.insert(schema.userPreferences).values({ userId: late.id, categories: ["spa"] });

    assert.equal((await verifyPrincipalBackfill(db)).clean, false);
    const result = await backfillGuestPrincipals(db);
    assert.equal(result.principalsCreated, 1);
    assert.equal((await verifyPrincipalBackfill(db)).clean, true);
  });

  it("never changes user_id on any row", async () => {
    const { db, schema } = database;
    const stays = await db.select().from(schema.hotelStays);
    assert.deepEqual(stays.map((s) => s.userId).sort(), [guestA, guestB].sort());
  });
});

describe("principal and session constraints", () => {
  it("allows at most one principal per account", async () => {
    const { db, schema } = database;
    assert.equal(await expectSqlFailure(() => db.insert(schema.guestPrincipals).values({ userId: guestA })), UNIQUE_VIOLATION);
  });

  it("allows many anonymous principals (no account attached)", async () => {
    const { db, schema } = database;
    await db.insert(schema.guestPrincipals).values({});
    await db.insert(schema.guestPrincipals).values({});
  });

  it("stores only a token hash, uniquely, and cascades sessions away with their principal", async () => {
    const { db, schema } = database;
    const [principal] = await db.insert(schema.guestPrincipals).values({}).returning();
    const now = new Date();
    const later = new Date(now.getTime() + 86_400_000);
    const values = { principalId: principal.id, tokenHash: "hash-of-a-random-token", idleExpiresAt: later, absoluteExpiresAt: later };

    await db.insert(schema.guestSessions).values(values);
    assert.equal(await expectSqlFailure(() => db.insert(schema.guestSessions).values(values)), UNIQUE_VIOLATION);

    const columns = Object.keys(schema.guestSessions);
    assert.equal(columns.some((name) => /^token$|raw/i.test(name)), false, "there is no column that could hold a raw token");

    await db.delete(schema.guestPrincipals).where(eq(schema.guestPrincipals.id, principal.id));
    const remaining = await db.execute(sql`select count(*)::int as n from guest_sessions where principal_id = ${principal.id}`);
    const rows = (Array.isArray(remaining) ? remaining : (remaining as unknown as { rows: Array<{ n: number }> }).rows) as Array<{ n: number }>;
    assert.equal(rows[0].n, 0);
  });

  it("deleting an account unlinks its principal rather than destroying the guest's history", async () => {
    const { db, schema } = database;
    const [account] = await db.insert(schema.users).values({ email: "principal-leaver@example.test", passwordHash: "x" }).returning();
    const [principal] = await db.insert(schema.guestPrincipals).values({ userId: account.id, linkedAt: new Date() }).returning();
    await db.delete(schema.users).where(eq(schema.users.id, account.id));
    const [after] = await db.select().from(schema.guestPrincipals).where(eq(schema.guestPrincipals.id, principal.id));
    assert.equal(after.userId, null, "the principal survives, now anonymous");
  });
});
