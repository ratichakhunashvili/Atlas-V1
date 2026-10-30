import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "./test-support/pglite";
import { lookupGuestForSupport } from "./operations/guest-support";

let database: TestDatabase;
let adminId: string;
let guestId: string;
let otherGuestId: string;

const SECRET_NAME = "Secret Stop Name Cafe";

before(async () => {
  database = await createTestDatabase();
  const { db, schema } = database;
  const [admin] = await db.insert(schema.users).values({ email: "support-admin@example.test", passwordHash: "x", role: "admin" }).returning();
  const [guest] = await db.insert(schema.users).values({ email: "supported-guest@example.test", passwordHash: "SECRET-PASSWORD-HASH" }).returning();
  const [other] = await db.insert(schema.users).values({ email: "unrelated-guest@example.test", passwordHash: "x" }).returning();
  adminId = admin.id;
  guestId = guest.id;
  otherGuestId = other.id;

  const [hotelPlace] = await db.insert(schema.places).values({ name: "[Test] Support Hotel", latitude: 41.7, longitude: 44.8, category: "hotel" }).returning();
  const [stopPlace] = await db.insert(schema.places).values({ name: SECRET_NAME, latitude: 41.71, longitude: 44.81, category: "restaurant" }).returning();
  const [hotel] = await db.insert(schema.hotels).values({ placeId: hotelPlace.id }).returning();
  await db.insert(schema.hotelStays).values({ userId: guestId, hotelId: hotel.id, checkIn: new Date("2026-10-18T09:00:00Z") });
  await db.insert(schema.hotelStays).values({ userId: otherGuestId, hotelId: hotel.id, checkIn: new Date("2026-10-18T09:00:00Z") });

  const [day] = await db
    .insert(schema.itineraryDays)
    .values({ userId: guestId, hotelId: hotel.id, dayNumber: 1, stopCount: 2, generatedAt: new Date("2026-10-18T10:00:00Z"), routeGeoJson: { secret: "route" } })
    .returning();
  await db.insert(schema.itineraryStops).values([
    { dayId: day.id, placeId: stopPlace.id, checkInMethod: "gps", name: SECRET_NAME, latitude: 41.71, longitude: 44.81, position: 0, visitedAt: new Date("2026-10-18T11:00:00Z") },
    { dayId: day.id, placeId: stopPlace.id, checkInMethod: "gps", name: SECRET_NAME, latitude: 41.72, longitude: 44.82, position: 1 },
  ]);
  await db.insert(schema.placeVisits).values({
    userId: guestId,
    placeId: stopPlace.id,
    firstVisitedAt: new Date("2026-10-18T11:00:00Z"),
    lastVisitedAt: new Date("2026-10-18T11:00:00Z"),
    firstVerificationMethod: "gps",
  });
});

after(async () => {
  await database.close();
});

describe("guest support lookup", () => {
  it("returns the minimal stay, plan and visit summary, and audits the access with its reason", async () => {
    const result = await lookupGuestForSupport(database.db, {
      actorUserId: adminId,
      email: "SUPPORTED-guest@example.test",
      reasonCode: "check_in_problem",
      note: "  says the QR will not scan  ",
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    assert.equal(result.view.activeStay?.hotelName, "[Test] Support Hotel");
    assert.equal(result.view.activeStay?.datesSource, "guest_declared");
    assert.deepEqual(result.view.planDays.map((d) => [d.dayNumber, d.activeStops, d.completedStops]), [[1, 2, 1]]);
    assert.equal(result.view.verifiedPlaceCount, 1);

    const events = await database.db.select().from(database.schema.adminAuditEvents).where(eq(database.schema.adminAuditEvents.targetId, guestId));
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "support.guest_lookup");
    assert.equal(events[0].actorUserId, adminId);
    assert.equal(events[0].reason, "check_in_problem: says the QR will not scan");
  });

  it("never exposes a password hash, a token, a stop name, a coordinate or the route", async () => {
    const result = await lookupGuestForSupport(database.db, { actorUserId: adminId, email: "supported-guest@example.test", reasonCode: "plan_problem" });
    const serialised = JSON.stringify(result);
    for (const forbidden of ["SECRET-PASSWORD-HASH", "passwordHash", SECRET_NAME, "latitude", "longitude", "41.71", "route", "tokenHash", otherGuestId]) {
      assert.equal(serialised.includes(forbidden), false, `leaked: ${forbidden}`);
    }
  });

  it("requires a recognised reason and refuses (without auditing a lookup) when it is missing", async () => {
    const before = await database.db.select().from(database.schema.adminAuditEvents);
    for (const bad of ["", "curiosity", "check_in_problem ", undefined as unknown as string]) {
      const result = await lookupGuestForSupport(database.db, { actorUserId: adminId, email: "supported-guest@example.test", reasonCode: bad });
      assert.equal(result.ok === false && result.reason, "invalid_reason", String(bad));
    }
    const after = await database.db.select().from(database.schema.adminAuditEvents);
    assert.equal(after.length, before.length, "nothing was looked up, so nothing is recorded as looked up");
  });

  it("is exact-match only: a prefix finds nobody, and the miss is audited without storing what was typed", async () => {
    const result = await lookupGuestForSupport(database.db, { actorUserId: adminId, email: "supported-guest", reasonCode: "account_question" });
    assert.equal(result.ok === false && result.reason, "not_found");

    const misses = await database.db.select().from(database.schema.adminAuditEvents).where(eq(database.schema.adminAuditEvents.targetId, "no_match"));
    assert.equal(misses.length, 1);
    assert.equal(JSON.stringify(misses[0]).includes("supported-guest"), false, "the typed email is not stored");
  });

  it("caps the free-text note", async () => {
    await lookupGuestForSupport(database.db, { actorUserId: adminId, email: "unrelated-guest@example.test", reasonCode: "stay_problem", note: "x".repeat(900) });
    const events = await database.db.select().from(database.schema.adminAuditEvents).where(eq(database.schema.adminAuditEvents.targetId, otherGuestId));
    assert.ok((events[0].reason ?? "").length <= 500);
  });
});
