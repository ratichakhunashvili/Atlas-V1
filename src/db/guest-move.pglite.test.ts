import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { and, eq, isNull } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "./test-support/pglite";
import { moveGuestToHotel } from "./operations/guest-support";

/** An admin moves a guest's active stay to another hotel: the base ("home") changes, history stays, it is audited. */

let database: TestDatabase;
let adminId: string;
let guestId: string;
let skillwillId: string;
let gurjaaniId: string;
let draftHotelId: string;

const GUEST = "moved-guest@example.test";

async function hotel(name: string, published = true) {
  const { db, schema } = database;
  const [place] = await db
    .insert(schema.places)
    .values({
      name,
      latitude: 41.7,
      longitude: 44.8,
      category: "hotel",
      kind: "hotel",
      publicationStatus: published ? "published" : "draft",
      verificationStatus: published ? "verified" : "unverified",
      publishedAt: published ? new Date() : null,
      verifiedAt: published ? new Date() : null,
    })
    .returning();
  const [row] = await db.insert(schema.hotels).values({ placeId: place.id }).returning();
  return row.id;
}

async function activeStays() {
  const { db, schema } = database;
  return db.select().from(schema.hotelStays).where(and(eq(schema.hotelStays.userId, guestId), isNull(schema.hotelStays.checkOut)));
}

before(async () => {
  database = await createTestDatabase();
  const { db, schema } = database;
  const [admin] = await db.insert(schema.users).values({ email: "mover@example.test", passwordHash: "x", role: "admin" }).returning();
  const [guest] = await db.insert(schema.users).values({ email: GUEST, passwordHash: "x" }).returning();
  adminId = admin.id;
  guestId = guest.id;
  skillwillId = await hotel("[Test] Skillwill");
  gurjaaniId = await hotel("[Test] Techpark Gurjaani");
  draftHotelId = await hotel("[Test] Draft Hotel", false);
  await db.insert(schema.hotelStays).values({ userId: guestId, hotelId: skillwillId, checkIn: new Date("2026-11-01T09:00:00Z") });
});
after(async () => {
  await database.close();
});

describe("admin moves a guest to another hotel", () => {
  it("closes the old stay, opens one at the new hotel, and audits who, from where, to where and why", async () => {
    const result = await moveGuestToHotel(database.db, { actorUserId: adminId, email: "Moved-Guest@Example.test", toHotelId: gurjaaniId, reasonCode: "stay_problem", note: "now at Techpark" });
    assert.deepEqual(result, { ok: true, status: "moved", hotelName: "[Test] Techpark Gurjaani", fromHotelName: "[Test] Skillwill" });

    const active = await activeStays();
    assert.equal(active.length, 1);
    assert.equal(active[0].hotelId, gurjaaniId);

    const { db, schema } = database;
    const old = await db.select().from(schema.hotelStays).where(eq(schema.hotelStays.hotelId, skillwillId));
    assert.equal(old.length, 1, "the old stay is kept as history");
    assert.ok(old[0].checkOut);

    const [audit] = await db.select().from(schema.adminAuditEvents).where(eq(schema.adminAuditEvents.action, "support.guest_moved"));
    assert.equal(audit.actorUserId, adminId);
    assert.equal(audit.targetId, guestId);
    assert.deepEqual(audit.before, { hotelId: skillwillId });
    assert.deepEqual(audit.after, { hotelId: gurjaaniId });
    assert.equal(audit.reason, "stay_problem: now at Techpark");
  });

  it("does nothing when the guest is already at that hotel", async () => {
    const result = await moveGuestToHotel(database.db, { actorUserId: adminId, email: GUEST, toHotelId: gurjaaniId, reasonCode: "stay_problem" });
    assert.equal(result.ok && result.status, "already_there");
    const { db, schema } = database;
    const audits = await db.select().from(schema.adminAuditEvents).where(eq(schema.adminAuditEvents.action, "support.guest_moved"));
    assert.equal(audits.length, 1);
  });

  it("refuses a hotel that is not published and verified, an unknown id, an unknown guest and a missing reason", async () => {
    const base = { actorUserId: adminId, email: GUEST, reasonCode: "stay_problem" };
    assert.equal((await moveGuestToHotel(database.db, { ...base, toHotelId: draftHotelId })).ok, false);
    assert.equal((await moveGuestToHotel(database.db, { ...base, toHotelId: "00000000-0000-4000-8000-000000000000" })).ok, false);
    assert.equal((await moveGuestToHotel(database.db, { ...base, email: "nobody@example.test", toHotelId: skillwillId })).ok, false);
    assert.equal((await moveGuestToHotel(database.db, { ...base, reasonCode: "curiosity", toHotelId: skillwillId })).ok, false);
    const active = await activeStays();
    assert.equal(active[0].hotelId, gurjaaniId, "nothing changed");
  });

  it("gives a guest with no stay one at the chosen hotel", async () => {
    const { db, schema } = database;
    await db.update(schema.hotelStays).set({ checkOut: new Date() }).where(eq(schema.hotelStays.userId, guestId));
    const result = await moveGuestToHotel(database.db, { actorUserId: adminId, email: GUEST, toHotelId: skillwillId, reasonCode: "stay_problem" });
    assert.deepEqual(result, { ok: true, status: "moved", hotelName: "[Test] Skillwill", fromHotelName: null });
    assert.equal((await activeStays())[0].hotelId, skillwillId);
  });
});
