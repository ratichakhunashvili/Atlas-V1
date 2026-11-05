import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "./test-support/pglite";
import { deleteGuestAccount } from "./operations/account-deletion";
import { recordVerifiedVisit } from "./operations/place-visits";

/** "Delete my account" removes the guest and their personal data for real (CLAUDE.md: no fake success). */

let database: TestDatabase;
before(async () => {
  database = await createTestDatabase();
});
after(async () => {
  await database.close();
});

async function seedGuestWithEverything(email: string) {
  const { db, schema } = database;
  const [user] = await db.insert(schema.users).values({ email, passwordHash: "x" }).returning();
  const [hotelPlace] = await db.insert(schema.places).values({ name: "Hotel", latitude: 41.7, longitude: 44.8, category: "hotel" }).returning();
  const [hotel] = await db.insert(schema.hotels).values({ placeId: hotelPlace.id }).returning();
  const [stay] = await db.insert(schema.hotelStays).values({ userId: user.id, hotelId: hotel.id, checkIn: new Date("2026-06-15T08:00:00Z") }).returning();
  await db.insert(schema.userPreferences).values({ userId: user.id, categories: ["museum"] });
  await db.insert(schema.itineraryDays).values({ userId: user.id, hotelId: hotel.id, hotelStayId: stay.id, dayNumber: 1, stopCount: 0 });
  const [museum] = await db.insert(schema.places).values({ name: "Museum", latitude: 41.7, longitude: 44.8, category: "museum" }).returning();
  await db.insert(schema.achievements).values({ placeId: museum.id, name: "Badge" });
  await recordVerifiedVisit(db, { userId: user.id, placeId: museum.id, method: "gps", now: new Date("2026-06-15T10:00:00Z") });
  return { user, museum };
}

describe("deleteGuestAccount", () => {
  it("removes the guest with their stay, preferences, plan, visits and badges", async () => {
    const { db, schema } = database;
    const { user, museum } = await seedGuestWithEverything("leaving@example.test");

    assert.deepEqual(await deleteGuestAccount(db, user.id), { ok: true });

    assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, user.id))).length, 0);
    assert.equal((await db.select().from(schema.hotelStays).where(eq(schema.hotelStays.userId, user.id))).length, 0);
    assert.equal((await db.select().from(schema.userPreferences).where(eq(schema.userPreferences.userId, user.id))).length, 0);
    assert.equal((await db.select().from(schema.itineraryDays).where(eq(schema.itineraryDays.userId, user.id))).length, 0);
    assert.equal((await db.select().from(schema.placeVisits).where(eq(schema.placeVisits.userId, user.id))).length, 0);
    assert.equal((await db.select().from(schema.achievementUnlocks).where(eq(schema.achievementUnlocks.userId, user.id))).length, 0);
    // Shared catalogue data is untouched.
    assert.equal((await db.select().from(schema.places).where(eq(schema.places.id, museum.id))).length, 1);
  });

  it("leaves other guests' data alone", async () => {
    const { db, schema } = database;
    const { user: leaving } = await seedGuestWithEverything("leaving-2@example.test");
    const { user: staying } = await seedGuestWithEverything("staying@example.test");
    await deleteGuestAccount(db, leaving.id);
    assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, staying.id))).length, 1);
    assert.equal((await db.select().from(schema.achievementUnlocks).where(eq(schema.achievementUnlocks.userId, staying.id))).length, 1);
  });

  it("refuses an admin account and changes nothing", async () => {
    const { db, schema } = database;
    const [admin] = await db.insert(schema.users).values({ email: "admin-self@example.test", passwordHash: "x", role: "admin" }).returning();
    assert.deepEqual(await deleteGuestAccount(db, admin.id), { ok: false, reason: "admin_account" });
    assert.equal((await db.select().from(schema.users).where(eq(schema.users.id, admin.id))).length, 1);
  });

  it("reports an account that no longer exists", async () => {
    assert.deepEqual(await deleteGuestAccount(database.db, "00000000-0000-4000-8000-000000000000"), { ok: false, reason: "not_found" });
  });
});
