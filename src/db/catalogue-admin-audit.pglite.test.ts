import assert from "node:assert/strict";
import { after, before, beforeEach, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "./test-support/pglite";
import { createHotelWithAudit, updateHotelPlaceWithAudit } from "./operations/hotel-admin";
import { addFacilityWithAudit, setFacilityStatusWithAudit } from "./operations/hotel-facility-admin";
import { changedPlaceDetails, updatePlaceWithAudit } from "./operations/place-admin";

/**
 * U090: hotel creation and edits, hotel-facility changes and Place detail edits are audited, each in the same
 * transaction as the change — exactly one correct entry per change, none for a refused or empty change, and if the
 * audit entry cannot be written the change itself is rolled back.
 */

const NOW = new Date("2026-11-13T10:00:00Z");
const MISSING_ACTOR = "00000000-0000-4000-8000-000000000000";

let database: TestDatabase;
let adminId: string;

before(async () => {
  database = await createTestDatabase();
  const [admin] = await database.db
    .insert(database.schema.users)
    .values({ email: "catalogue-auditor@example.test", passwordHash: "x", role: "admin" })
    .returning();
  adminId = admin.id;
});

after(async () => {
  await database.close();
});

let counter = 0;
async function seedPlace(overrides: Partial<typeof database.schema.places.$inferInsert> = {}) {
  counter += 1;
  const [place] = await database.db
    .insert(database.schema.places)
    .values({ name: `Place ${counter}`, latitude: 41.7, longitude: 44.8, category: "hotel", ...overrides })
    .returning();
  return place;
}

async function auditRows() {
  return database.db.select().from(database.schema.adminAuditEvents);
}

/** Entries written since the last call to `mark()`, oldest first. */
let seen = new Set<string>();
async function mark() {
  seen = new Set((await auditRows()).map((row) => row.id));
}
async function newEntries() {
  const rows = await auditRows();
  return rows.filter((row) => !seen.has(row.id)).sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
}

beforeEach(mark);

describe("hotel creation", () => {
  it("writes exactly one hotel.created with actor, target, hotelId and the place's kind change", async () => {
    const place = await seedPlace({ kind: "business" });
    const hotel = await createHotelWithAudit(database.db, { actorUserId: adminId, placeId: place.id, now: NOW });

    const entries = await newEntries();
    assert.equal(entries.length, 1);
    const [entry] = entries;
    assert.equal(entry.action, "hotel.created");
    assert.equal(entry.actorUserId, adminId);
    assert.equal(entry.targetType, "hotel");
    assert.equal(entry.targetId, hotel.id);
    assert.equal(entry.hotelId, hotel.id);
    assert.deepEqual(entry.before, { placeKind: "business" });
    assert.deepEqual(entry.after, { placeId: place.id, placeKind: "hotel" });
    assert.equal(entry.occurredAt.toISOString(), NOW.toISOString());
  });

  it("writes nothing and creates nothing when the place already belongs to a hotel", async () => {
    const place = await seedPlace({ kind: "hotel" });
    await createHotelWithAudit(database.db, { actorUserId: adminId, placeId: place.id });
    await mark();

    await assert.rejects(() => createHotelWithAudit(database.db, { actorUserId: adminId, placeId: place.id }));
    assert.equal((await newEntries()).length, 0);
    const hotels = await database.db.select().from(database.schema.hotels).where(eq(database.schema.hotels.placeId, place.id));
    assert.equal(hotels.length, 1);
  });

  it("rolls the hotel back when its audit entry cannot be written (same transaction)", async () => {
    const place = await seedPlace({ kind: "business" });
    await assert.rejects(() => createHotelWithAudit(database.db, { actorUserId: MISSING_ACTOR, placeId: place.id }));

    assert.equal((await newEntries()).length, 0);
    const hotels = await database.db.select().from(database.schema.hotels).where(eq(database.schema.hotels.placeId, place.id));
    assert.equal(hotels.length, 0);
    const [unchanged] = await database.db.select().from(database.schema.places).where(eq(database.schema.places.id, place.id));
    assert.equal(unchanged.kind, "business");
  });
});

describe("hotel edits", () => {
  it("writes exactly one hotel.updated with the old and new place", async () => {
    const first = await seedPlace({ kind: "hotel" });
    const hotel = await createHotelWithAudit(database.db, { actorUserId: adminId, placeId: first.id });
    const second = await seedPlace({ kind: "attraction" });
    await mark();

    const result = await updateHotelPlaceWithAudit(database.db, { actorUserId: adminId, hotelId: hotel.id, placeId: second.id });
    assert.equal(result?.changed, true);

    const entries = await newEntries();
    assert.equal(entries.length, 1);
    const [entry] = entries;
    assert.equal(entry.action, "hotel.updated");
    assert.equal(entry.actorUserId, adminId);
    assert.equal(entry.targetId, hotel.id);
    assert.equal(entry.hotelId, hotel.id);
    assert.deepEqual(entry.before, { placeId: first.id, placeKind: "attraction" });
    assert.deepEqual(entry.after, { placeId: second.id, placeKind: "hotel" });
  });

  it("writes nothing when the same place is saved again, or the hotel does not exist", async () => {
    const place = await seedPlace({ kind: "hotel" });
    const hotel = await createHotelWithAudit(database.db, { actorUserId: adminId, placeId: place.id });
    await mark();

    const same = await updateHotelPlaceWithAudit(database.db, { actorUserId: adminId, hotelId: hotel.id, placeId: place.id });
    assert.equal(same?.changed, false);
    const missing = await updateHotelPlaceWithAudit(database.db, {
      actorUserId: adminId,
      hotelId: "11111111-1111-4111-8111-111111111111",
      placeId: place.id,
    });
    assert.equal(missing, null);
    assert.equal((await newEntries()).length, 0);
  });

  it("writes nothing and changes nothing when the new place already belongs to another hotel", async () => {
    const a = await seedPlace({ kind: "hotel" });
    const b = await seedPlace({ kind: "hotel" });
    const hotelA = await createHotelWithAudit(database.db, { actorUserId: adminId, placeId: a.id });
    await createHotelWithAudit(database.db, { actorUserId: adminId, placeId: b.id });
    await mark();

    await assert.rejects(() => updateHotelPlaceWithAudit(database.db, { actorUserId: adminId, hotelId: hotelA.id, placeId: b.id }));
    assert.equal((await newEntries()).length, 0);
    const [stillA] = await database.db.select().from(database.schema.hotels).where(eq(database.schema.hotels.id, hotelA.id));
    assert.equal(stillA.placeId, a.id);
  });
});

describe("hotel facilities", () => {
  async function seedHotel() {
    const place = await seedPlace({ kind: "hotel" });
    const hotel = await createHotelWithAudit(database.db, { actorUserId: adminId, placeId: place.id });
    await mark();
    return hotel;
  }

  it("adding one writes exactly one facility.added with the hotel", async () => {
    const hotel = await seedHotel();
    const spa = await seedPlace({ kind: "business" });
    const facility = await addFacilityWithAudit(database.db, { actorUserId: adminId, hotelId: hotel.id, placeId: spa.id, facilityType: "spa" });
    assert.ok(facility);

    const entries = await newEntries();
    assert.equal(entries.length, 1);
    const [entry] = entries;
    assert.equal(entry.action, "facility.added");
    assert.equal(entry.actorUserId, adminId);
    assert.equal(entry.targetType, "hotel_facility");
    assert.equal(entry.targetId, facility.id);
    assert.equal(entry.hotelId, hotel.id);
    assert.equal(entry.before, null);
    assert.deepEqual(entry.after, { placeId: spa.id, facilityType: "spa", status: "active" });
  });

  it("adding a place that is already a facility returns null and writes nothing", async () => {
    const hotel = await seedHotel();
    const pool = await seedPlace({ kind: "business" });
    await addFacilityWithAudit(database.db, { actorUserId: adminId, hotelId: hotel.id, placeId: pool.id, facilityType: "pool" });
    await mark();

    const again = await addFacilityWithAudit(database.db, { actorUserId: adminId, hotelId: hotel.id, placeId: pool.id, facilityType: "pool" });
    assert.equal(again, null);
    assert.equal((await newEntries()).length, 0);
  });

  it("deactivating and reactivating write one entry each; repeating a click writes nothing", async () => {
    const hotel = await seedHotel();
    const gym = await seedPlace({ kind: "business" });
    const facility = await addFacilityWithAudit(database.db, { actorUserId: adminId, hotelId: hotel.id, placeId: gym.id, facilityType: "gym" });
    assert.ok(facility);
    await mark();

    const off = await setFacilityStatusWithAudit(database.db, { actorUserId: adminId, facilityId: facility.id, status: "inactive", now: new Date("2026-11-13T10:01:00Z") });
    assert.equal(off?.changed, true);
    const offAgain = await setFacilityStatusWithAudit(database.db, { actorUserId: adminId, facilityId: facility.id, status: "inactive" });
    assert.equal(offAgain?.changed, false);
    const on = await setFacilityStatusWithAudit(database.db, { actorUserId: adminId, facilityId: facility.id, status: "active", now: new Date("2026-11-13T10:02:00Z") });
    assert.equal(on?.changed, true);

    const entries = await newEntries();
    assert.deepEqual(
      entries.map((entry) => [entry.action, entry.targetId, entry.hotelId, entry.before, entry.after]),
      [
        ["facility.deactivated", facility.id, hotel.id, { status: "active" }, { status: "inactive" }],
        ["facility.reactivated", facility.id, hotel.id, { status: "inactive" }, { status: "active" }],
      ]
    );
  });

  it("rolls a status change back when its audit entry cannot be written", async () => {
    const hotel = await seedHotel();
    const sauna = await seedPlace({ kind: "business" });
    const facility = await addFacilityWithAudit(database.db, { actorUserId: adminId, hotelId: hotel.id, placeId: sauna.id, facilityType: "sauna" });
    assert.ok(facility);
    await mark();

    await assert.rejects(() => setFacilityStatusWithAudit(database.db, { actorUserId: MISSING_ACTOR, facilityId: facility.id, status: "inactive" }));
    assert.equal((await newEntries()).length, 0);
    const [row] = await database.db
      .select()
      .from(database.schema.hotelFacilities)
      .where(eq(database.schema.hotelFacilities.id, facility.id));
    assert.equal(row.status, "active");
  });

  it("an unknown facility returns null and writes nothing", async () => {
    const result = await setFacilityStatusWithAudit(database.db, {
      actorUserId: adminId,
      facilityId: "22222222-2222-4222-8222-222222222222",
      status: "inactive",
    });
    assert.equal(result, null);
    assert.equal((await newEntries()).length, 0);
  });
});

describe("place detail edits", () => {
  it("write exactly one place.updated holding only the changed fields, with the hotel when it is a hotel's place", async () => {
    const place = await seedPlace({ kind: "hotel", address: "1 Old Street", phone: "+995 1", description: "Same" });
    const hotel = await createHotelWithAudit(database.db, { actorUserId: adminId, placeId: place.id });
    await mark();

    const saved = await updatePlaceWithAudit(database.db, {
      actorUserId: adminId,
      placeId: place.id,
      changes: { name: place.name, description: "Same", address: "2 New Street", phone: "+995 2" },
    });
    assert.ok(saved);

    const entries = await newEntries();
    assert.equal(entries.length, 1);
    const [entry] = entries;
    assert.equal(entry.action, "place.updated");
    assert.equal(entry.actorUserId, adminId);
    assert.equal(entry.targetType, "place");
    assert.equal(entry.targetId, place.id);
    assert.equal(entry.hotelId, hotel.id);
    assert.deepEqual(entry.before, { address: "1 Old Street", phone: "+995 1" });
    assert.deepEqual(entry.after, { address: "2 New Street", phone: "+995 2" });
  });

  it("a save without changes writes nothing", async () => {
    const place = await seedPlace({ address: "Unchanged" });
    await mark();
    await updatePlaceWithAudit(database.db, {
      actorUserId: adminId,
      placeId: place.id,
      changes: { name: place.name, address: "Unchanged", latitude: place.latitude, longitude: place.longitude },
    });
    assert.equal((await newEntries()).length, 0);
  });

  it("a status change in the same save gets its own entry, in the same transaction, and no duplicate in place.updated", async () => {
    const place = await seedPlace({ verificationStatus: "verified", verifiedAt: NOW });
    await mark();
    await updatePlaceWithAudit(database.db, {
      actorUserId: adminId,
      placeId: place.id,
      changes: { phone: "+995 3", publicationStatus: "published" },
    });
    const entries = await newEntries();
    assert.deepEqual(entries.map((entry) => entry.action).sort(), ["place.published", "place.updated"]);
    const updated = entries.find((entry) => entry.action === "place.updated");
    assert.deepEqual(updated?.after, { phone: "+995 3" });
    assert.equal(updated?.hotelId, null);
  });

  it("a refused edit (publishing an archived place) saves nothing and writes nothing", async () => {
    const place = await seedPlace({ archivedAt: NOW, address: "Archived Road" });
    await mark();
    await assert.rejects(() =>
      updatePlaceWithAudit(database.db, {
        actorUserId: adminId,
        placeId: place.id,
        changes: { address: "Moved Road", publicationStatus: "published" },
      })
    );
    assert.equal((await newEntries()).length, 0);
    const [row] = await database.db.select().from(database.schema.places).where(eq(database.schema.places.id, place.id));
    assert.equal(row.address, "Archived Road");
  });

  it("rolls the edit back when its audit entry cannot be written", async () => {
    const place = await seedPlace({ address: "Before" });
    await mark();
    await assert.rejects(() =>
      updatePlaceWithAudit(database.db, { actorUserId: MISSING_ACTOR, placeId: place.id, changes: { address: "After" } })
    );
    assert.equal((await newEntries()).length, 0);
    const [row] = await database.db.select().from(database.schema.places).where(eq(database.schema.places.id, place.id));
    assert.equal(row.address, "Before");
  });

  it("an unknown place returns null and writes nothing", async () => {
    const result = await updatePlaceWithAudit(database.db, {
      actorUserId: adminId,
      placeId: "33333333-3333-4333-8333-333333333333",
      changes: { address: "Nowhere" },
    });
    assert.equal(result, null);
    assert.equal((await newEntries()).length, 0);
  });
});

describe("changedPlaceDetails", () => {
  const base = {
    name: "A",
    description: null,
    latitude: 41.7,
    longitude: 44.8,
    category: "restaurant" as const,
    address: null,
    imageUrl: null,
    website: null,
    phone: null,
    visitDurationMinutes: null,
    priceLevel: null,
    priceLevelSource: null,
  };

  it("is null when nothing descriptive changed", () => {
    assert.equal(changedPlaceDetails(base, { ...base }), null);
  });

  it("reports only the fields that changed, including a value cleared to null", () => {
    assert.deepEqual(changedPlaceDetails({ ...base, phone: "+1" }, { ...base, phone: null, latitude: 41.8 }), {
      before: { latitude: 41.7, phone: "+1" },
      after: { latitude: 41.8, phone: null },
    });
  });
});
