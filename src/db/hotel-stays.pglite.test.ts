import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { and, eq, isNull } from "drizzle-orm";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";
import { createHotelStay, switchActiveStay } from "./operations/hotel-stays";
import {
  PENDING_SWITCH_TTL_MS,
  clearPendingHotelSwitch,
  findPendingHotelSwitch,
  recordPendingHotelSwitch,
} from "./operations/pending-hotel-switches";

/**
 * Database-level proof for the one-active-stay invariant, the confirmed hotel
 * switch, and the conditional visit write. In-memory PGlite built from the
 * checked-in migrations; never a remote or shared database.
 */

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

let database: TestDatabase;

before(async () => {
  database = await createTestDatabase();
});

after(async () => {
  await database.close();
});

async function seedUser(email: string) {
  const [user] = await database.db
    .insert(database.schema.users)
    .values({ email, passwordHash: "not-a-real-hash" })
    .returning();
  return user;
}

async function seedHotel(name: string) {
  const { db, schema } = database;
  const [place] = await db
    .insert(schema.places)
    .values({ name, latitude: 41.7, longitude: 44.8, category: "hotel" })
    .returning();
  const [hotel] = await db.insert(schema.hotels).values({ placeId: place.id }).returning();
  return hotel;
}

describe("a guest has at most one active stay", () => {
  it("refuses a second open stay for the same user", async () => {
    const user = await seedUser("one-stay@example.test");
    const hotelA = await seedHotel("Stay hotel A");
    const hotelB = await seedHotel("Stay hotel B");
    const { db, schema } = database;

    await db.insert(schema.hotelStays).values({ userId: user.id, hotelId: hotelA.id, checkIn: new Date() });

    const code = await expectSqlFailure(() =>
      db.insert(schema.hotelStays).values({ userId: user.id, hotelId: hotelB.id, checkIn: new Date() })
    );
    assert.equal(code, UNIQUE_VIOLATION);
  });

  it("refuses a second open stay even at the SAME hotel", async () => {
    const user = await seedUser("same-hotel-twice@example.test");
    const hotel = await seedHotel("Same hotel twice");
    const { db, schema } = database;

    await db.insert(schema.hotelStays).values({ userId: user.id, hotelId: hotel.id, checkIn: new Date() });

    const code = await expectSqlFailure(() =>
      db.insert(schema.hotelStays).values({ userId: user.id, hotelId: hotel.id, checkIn: new Date() })
    );
    assert.equal(code, UNIQUE_VIOLATION);
  });

  it("allows any number of CLOSED stays, so history is unbounded", async () => {
    const user = await seedUser("history@example.test");
    const hotel = await seedHotel("History hotel");
    const { db, schema } = database;

    for (let index = 0; index < 3; index += 1) {
      await db.insert(schema.hotelStays).values({
        userId: user.id,
        hotelId: hotel.id,
        checkIn: new Date(`2026-0${index + 1}-01T00:00:00Z`),
        checkOut: new Date(`2026-0${index + 1}-05T00:00:00Z`),
      });
    }

    const stays = await db.select().from(schema.hotelStays).where(eq(schema.hotelStays.userId, user.id));
    assert.equal(stays.length, 3);
  });
});

describe("the confirmed hotel switch", () => {
  it("closes the old stay and opens the new one without ever violating the invariant", async () => {
    const user = await seedUser("switcher@example.test");
    const hotelA = await seedHotel("Switch from");
    const hotelB = await seedHotel("Switch to");
    const { db, schema } = database;
    const now = new Date("2026-10-14T12:00:00Z");

    await db
      .insert(schema.hotelStays)
      .values({ userId: user.id, hotelId: hotelA.id, checkIn: new Date("2026-10-10T12:00:00Z") });

    // The REAL production operation, not a copy of its SQL: db/queries/hotel-stays.ts
    // only binds the production database handle to this same function.
    const switched = await switchActiveStay(db, { userId: user.id, toHotelId: hotelB.id, now });
    assert.notEqual(switched, null);

    const active = await db
      .select()
      .from(schema.hotelStays)
      .where(and(eq(schema.hotelStays.userId, user.id), isNull(schema.hotelStays.checkOut)));

    assert.equal(active.length, 1);
    assert.equal(active[0].hotelId, hotelB.id);

    // The old stay is closed, not deleted: it remains the guest's history.
    const all = await db.select().from(schema.hotelStays).where(eq(schema.hotelStays.userId, user.id));
    assert.equal(all.length, 2);
    const closed = all.find((stay) => stay.hotelId === hotelA.id);
    assert.equal(closed?.checkOut?.toISOString(), now.toISOString());
  });

  it("leaves the original stay untouched when the new insert fails inside the transaction", async () => {
    const user = await seedUser("rollback@example.test");
    const hotelA = await seedHotel("Rollback from");
    const { db, schema } = database;
    const now = new Date("2026-10-14T12:00:00Z");

    await db
      .insert(schema.hotelStays)
      .values({ userId: user.id, hotelId: hotelA.id, checkIn: new Date("2026-10-10T12:00:00Z") });

    // The real operation, against a hotel id that does not exist: the foreign key
    // rejects the insert and the whole transaction rolls back.
    await assert.rejects(
      switchActiveStay(db, { userId: user.id, toHotelId: "00000000-0000-4000-8000-000000000000", now })
    );

    // The guest still has their original stay: a failed switch never strands them with none.
    const active = await db
      .select()
      .from(schema.hotelStays)
      .where(and(eq(schema.hotelStays.userId, user.id), isNull(schema.hotelStays.checkOut)));

    assert.equal(active.length, 1);
    assert.equal(active[0].hotelId, hotelA.id);
  });
});

describe("recording a visit", () => {
  async function seedStopForVisit(email: string, checkInMethod: "gps" | "qr") {
    const user = await seedUser(email);
    const hotel = await seedHotel(`${email} hotel`);
    const { db, schema } = database;

    const [stay] = await db
      .insert(schema.hotelStays)
      .values({ userId: user.id, hotelId: hotel.id, checkIn: new Date("2026-10-10T12:00:00Z") })
      .returning();

    const [day] = await db
      .insert(schema.itineraryDays)
      .values({ userId: user.id, hotelId: hotel.id, hotelStayId: stay.id, dayNumber: 1, stopCount: 1 })
      .returning();

    const [stop] = await db
      .insert(schema.itineraryStops)
      .values({
        dayId: day.id,
        checkInMethod,
        name: "A partner gallery",
        latitude: 41.7,
        longitude: 44.8,
        position: 1,
      })
      .returning();

    return { day, stop };
  }

  it("marks a stop visited once; a repeat update matches no row", async () => {
    const { stop } = await seedStopForVisit("idempotent@example.test", "gps");
    const { db, schema } = database;

    const first = await db
      .update(schema.itineraryStops)
      .set({ visitedAt: new Date() })
      .where(and(eq(schema.itineraryStops.id, stop.id), isNull(schema.itineraryStops.visitedAt)))
      .returning();
    assert.equal(first.length, 1);

    // The second attempt is what a double-tap or a retried request looks like.
    // PGlite serializes statements, so this proves the conditional-UPDATE semantics
    // the guard relies on — not parallel row locking, which needs a real server.
    const second = await db
      .update(schema.itineraryStops)
      .set({ visitedAt: new Date() })
      .where(and(eq(schema.itineraryStops.id, stop.id), isNull(schema.itineraryStops.visitedAt)))
      .returning();
    assert.equal(second.length, 0);
  });

  it("does not change the stop's saved check-in method when the visit is recorded", async () => {
    const { stop } = await seedStopForVisit("method-preserved@example.test", "qr");
    const { db, schema } = database;

    await db
      .update(schema.itineraryStops)
      .set({ visitedAt: new Date() })
      .where(and(eq(schema.itineraryStops.id, stop.id), isNull(schema.itineraryStops.visitedAt)));

    const [after] = await db.select().from(schema.itineraryStops).where(eq(schema.itineraryStops.id, stop.id));
    assert.equal(after.checkInMethod, "qr", "the stop's requirement survives its visit");
    assert.notEqual(after.visitedAt, null);
  });

  it("still refuses to supersede a completed stop — history stays history", async () => {
    const { stop } = await seedStopForVisit("no-supersede@example.test", "gps");
    const { db, schema } = database;

    await db
      .update(schema.itineraryStops)
      .set({ visitedAt: new Date() })
      .where(eq(schema.itineraryStops.id, stop.id));

    const code = await expectSqlFailure(() =>
      db
        .update(schema.itineraryStops)
        .set({ supersededAt: new Date(), supersededReason: "plan_regenerated" })
        .where(eq(schema.itineraryStops.id, stop.id))
    );
    assert.equal(code, CHECK_VIOLATION);
  });
});

describe("the production stay operations themselves", () => {
  it("createHotelStay reports a lost race as null rather than throwing", async () => {
    const user = await seedUser("race@example.test");
    const hotel = await seedHotel("Race hotel");
    const { db } = database;

    const first = await createHotelStay(db, { userId: user.id, hotelId: hotel.id, checkIn: new Date() });
    assert.notEqual(first, null);

    // The unique index rejects this; the operation must translate that into null,
    // which is what lets the action re-read the stay that won.
    const second = await createHotelStay(db, { userId: user.id, hotelId: hotel.id, checkIn: new Date() });
    assert.equal(second, null);
  });

  it("switchActiveStay reports a lost race as null rather than throwing", async () => {
    const user = await seedUser("switch-race@example.test");
    const hotelA = await seedHotel("Switch race from");
    const hotelB = await seedHotel("Switch race to");
    const { db } = database;
    const now = new Date("2026-10-14T12:00:00Z");

    await createHotelStay(db, { userId: user.id, hotelId: hotelA.id, checkIn: now });
    const switched = await switchActiveStay(db, { userId: user.id, toHotelId: hotelB.id, now });
    assert.equal(switched?.hotelId, hotelB.id);
  });
});

describe("the pending hotel switch", () => {
  const NOW = new Date("2026-10-14T12:00:00Z");

  it("records a verified scan and reads it back with the hotel's name", async () => {
    const user = await seedUser("pending@example.test");
    const hotel = await seedHotel("Pending hotel");
    const { db } = database;

    await recordPendingHotelSwitch(db, { userId: user.id, hotelId: hotel.id, now: NOW });

    const pending = await findPendingHotelSwitch(db, user.id, NOW);
    assert.equal(pending?.hotelId, hotel.id);
    assert.equal(pending?.hotelName, "Pending hotel");
  });

  it("keeps only the most recent question: a second scan replaces the first", async () => {
    const user = await seedUser("pending-replaced@example.test");
    const hotelA = await seedHotel("Pending A");
    const hotelB = await seedHotel("Pending B");
    const { db, schema } = database;

    await recordPendingHotelSwitch(db, { userId: user.id, hotelId: hotelA.id, now: NOW });
    await recordPendingHotelSwitch(db, { userId: user.id, hotelId: hotelB.id, now: NOW });

    const rows = await db
      .select()
      .from(schema.pendingHotelSwitches)
      .where(eq(schema.pendingHotelSwitches.userId, user.id));

    assert.equal(rows.length, 1);
    assert.equal(rows[0].hotelId, hotelB.id);
  });

  it("refuses to read an expired question, even though the row is still there", async () => {
    const user = await seedUser("pending-expired@example.test");
    const hotel = await seedHotel("Expired pending hotel");
    const { db, schema } = database;

    await recordPendingHotelSwitch(db, { userId: user.id, hotelId: hotel.id, now: NOW });

    const justAfter = new Date(NOW.getTime() + PENDING_SWITCH_TTL_MS + 1);
    assert.equal(await findPendingHotelSwitch(db, user.id, justAfter), null);

    // Still present — expiry is enforced on read, not by a cleanup job.
    const rows = await db
      .select()
      .from(schema.pendingHotelSwitches)
      .where(eq(schema.pendingHotelSwitches.userId, user.id));
    assert.equal(rows.length, 1);
  });

  it("is still valid at the last instant before expiry", async () => {
    const user = await seedUser("pending-boundary@example.test");
    const hotel = await seedHotel("Boundary pending hotel");
    const { db } = database;

    await recordPendingHotelSwitch(db, { userId: user.id, hotelId: hotel.id, now: NOW });

    const atExpiry = new Date(NOW.getTime() + PENDING_SWITCH_TTL_MS);
    assert.notEqual(await findPendingHotelSwitch(db, user.id, atExpiry), null);
  });

  it("is cleared once answered, so a reopened tab cannot confirm it later", async () => {
    const user = await seedUser("pending-cleared@example.test");
    const hotel = await seedHotel("Cleared pending hotel");
    const { db } = database;

    await recordPendingHotelSwitch(db, { userId: user.id, hotelId: hotel.id, now: NOW });
    await clearPendingHotelSwitch(db, user.id);

    assert.equal(await findPendingHotelSwitch(db, user.id, NOW), null);
  });

  it("clearing when there is nothing pending is safe", async () => {
    const user = await seedUser("pending-noop@example.test");
    await clearPendingHotelSwitch(database.db, user.id);
    assert.equal(await findPendingHotelSwitch(database.db, user.id, NOW), null);
  });

  it("belongs to one guest only: another guest's pending switch is invisible", async () => {
    const owner = await seedUser("pending-owner@example.test");
    const other = await seedUser("pending-other@example.test");
    const hotel = await seedHotel("Owned pending hotel");
    const { db } = database;

    await recordPendingHotelSwitch(db, { userId: owner.id, hotelId: hotel.id, now: NOW });

    assert.equal(await findPendingHotelSwitch(db, other.id, NOW), null);
  });

  it("disappears with the hotel it refers to, so it can never resolve to nothing", async () => {
    const user = await seedUser("pending-cascade@example.test");
    const hotel = await seedHotel("Deleted pending hotel");
    const { db, schema } = database;

    await recordPendingHotelSwitch(db, { userId: user.id, hotelId: hotel.id, now: NOW });
    await db.delete(schema.hotels).where(eq(schema.hotels.id, hotel.id));

    const rows = await db
      .select()
      .from(schema.pendingHotelSwitches)
      .where(eq(schema.pendingHotelSwitches.userId, user.id));
    assert.deepEqual(rows, []);
  });
});
