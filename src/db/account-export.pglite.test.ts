import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "./test-support/pglite";
import { gatherAccountExport } from "./operations/account-export";
import { recordVerifiedVisit } from "./operations/place-visits";
import { handleAccountExport } from "@/features/account-export/handler";

/** CAND-01: "Download my data" returns the signed-in user's own data and nobody else's, against the real migrations. */

let database: TestDatabase;
before(async () => {
  database = await createTestDatabase();
});
after(async () => {
  await database.close();
});

const NOW = new Date("2026-11-12T10:00:00Z");

async function seedGuest(label: string) {
  const { db, schema } = database;
  const [user] = await db.insert(schema.users).values({ email: `${label}@example.test`, name: `Name ${label}`, passwordHash: `hash-${label}` }).returning();
  const [hotelPlace] = await db
    .insert(schema.places)
    .values({ name: `Hotel ${label}`, latitude: 41.7, longitude: 44.8, category: "hotel", kind: "hotel" })
    .returning();
  const [hotel] = await db.insert(schema.hotels).values({ placeId: hotelPlace.id }).returning();
  const [stay] = await db.insert(schema.hotelStays).values({ userId: user.id, hotelId: hotel.id, checkIn: new Date("2026-11-10T08:00:00Z") }).returning();
  await db.insert(schema.userPreferences).values({ userId: user.id, categories: ["museum"], budget: "moderate" });
  await db.insert(schema.pendingHotelSwitches).values({ userId: user.id, hotelId: hotel.id, expiresAt: new Date("2026-11-12T11:00:00Z") });
  const [day] = await db
    .insert(schema.itineraryDays)
    .values({ userId: user.id, hotelId: hotel.id, hotelStayId: stay.id, dayNumber: 1, stopCount: 1, routeGeoJson: { type: "Feature" } })
    .returning();
  const [museum] = await db.insert(schema.places).values({ name: `Museum ${label}`, latitude: 41.7, longitude: 44.8, category: "museum" }).returning();
  await db.insert(schema.itineraryStops).values({
    dayId: day.id,
    placeId: museum.id,
    checkInMethod: "gps",
    name: `Stop ${label}`,
    latitude: 41.7,
    longitude: 44.8,
    position: 1,
  });
  await db.insert(schema.achievements).values({ placeId: museum.id, name: `Badge ${label}` });
  await recordVerifiedVisit(db, { userId: user.id, placeId: museum.id, method: "gps", now: new Date("2026-11-11T10:00:00Z") });
  await db.insert(schema.guestPrincipals).values({ userId: user.id }).onConflictDoNothing();
  const [principal] = await db.select().from(schema.guestPrincipals).where(eq(schema.guestPrincipals.userId, user.id));
  await db.insert(schema.guestSessions).values({
    principalId: principal.id,
    tokenHash: `session-hash-${label}`,
    idleExpiresAt: new Date("2026-11-13T10:00:00Z"),
    absoluteExpiresAt: new Date("2026-12-12T10:00:00Z"),
  });
  await db.insert(schema.rateLimitAttempts).values({ scope: "place_check_in", actorId: user.id });
  return { user, stay, day };
}

describe("gatherAccountExport", () => {
  it("contains every kind of user-owned row for A, and nothing of B's", async () => {
    const a = await seedGuest("a");
    const b = await seedGuest("b");

    const data = await gatherAccountExport(database.db, a.user.id, NOW);
    assert.ok(data);
    assert.equal(data.exportedAt, NOW.toISOString());
    assert.equal(data.account.id, a.user.id);
    assert.equal(data.account.email, "a@example.test");
    assert.equal(data.account.name, "Name a");
    assert.deepEqual(data.preferences?.categories, ["museum"]);
    assert.deepEqual(data.stays.map((stay) => stay.hotel), ["Hotel a"]);
    assert.deepEqual(data.pendingHotelSwitches.map((row) => row.hotel), ["Hotel a"]);
    assert.equal(data.plans.length, 1);
    assert.equal(data.plans[0].stayId, a.stay.id);
    assert.deepEqual(data.plans[0].stops.map((stop) => stop.name), ["Stop a"]);
    assert.deepEqual(data.visits.map((visit) => visit.place), ["Museum a"]);
    assert.deepEqual(data.achievements.map((unlock) => unlock.achievement), ["Badge a"]);
    assert.equal(data.guestProfiles.length, 1);
    assert.equal(data.guestProfiles[0].sessions.length, 1);

    const text = JSON.stringify(data);
    for (const leak of [b.user.id, "b@example.test", "Name b", "Hotel b", "Stop b", "Museum b", "Badge b", b.stay.id, b.day.id]) {
      assert.ok(!text.includes(leak), `A's export must not contain B's ${leak}`);
    }
  });

  it("never contains a password hash, session token hash, rate-limit record or the route drawing", async () => {
    const a = await seedGuest("secrets");
    const text = JSON.stringify(await gatherAccountExport(database.db, a.user.id, NOW));
    for (const forbidden of ["passwordHash", "password_hash", "hash-secrets", "tokenHash", "session-hash-secrets", "place_check_in", "routeGeoJson"]) {
      assert.ok(!text.includes(forbidden), `the export must not contain ${forbidden}`);
    }
  });

  it("returns null for an account that no longer exists", async () => {
    assert.equal(await gatherAccountExport(database.db, "00000000-0000-4000-8000-000000000000", NOW), null);
  });
});

describe("handleAccountExport with the real query", () => {
  const allowAll = async () => true;

  it("signed out gets 401 JSON and no data is read", async () => {
    let read = false;
    const response = await handleAccountExport(
      { currentUserId: async () => null, allowExport: allowAll, gather: async () => ((read = true), {}) },
      NOW
    );
    assert.equal(response.status, 401);
    assert.match(response.headers.get("Content-Type") ?? "", /application\/json/);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("Content-Disposition"), null);
    assert.equal(read, false);
  });

  it("signed in as A downloads A's file, never B's", async () => {
    const a = await seedGuest("route-a");
    const b = await seedGuest("route-b");
    const response = await handleAccountExport(
      { currentUserId: async () => a.user.id, allowExport: allowAll, gather: (userId, now) => gatherAccountExport(database.db, userId, now) },
      NOW
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type") ?? "", /application\/json/);
    assert.equal(response.headers.get("Content-Disposition"), 'attachment; filename="atlas-data-2026-11-12.json"');
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const body = await response.text();
    assert.ok(body.includes("route-a@example.test"));
    assert.ok(!body.includes("route-b@example.test"));
    assert.ok(!body.includes(b.user.id));
  });
});
