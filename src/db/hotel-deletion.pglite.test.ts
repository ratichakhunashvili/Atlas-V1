import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";
import {
  blocksOnGuestHistory,
  countHotelDeletionBlockers,
  hasHotelDeletionBlockers,
  hotelDeletionBlockedMessage,
} from "./operations/hotel-deletion";

/**
 * Deleting a hotel must not delete somebody's trip.
 *
 * Before migration 0009 the foreign keys cascaded, so removing a hotel silently
 * took every stay at it and every itinerary and completed visit inside those
 * stays. These tests prove both halves of the fix: the counting the admin screen
 * explains itself with, and the database constraint that holds even if the
 * application is bypassed entirely.
 *
 * PGlite serialises statements — nothing here claims anything about parallel load.
 */

const RESTRICT_VIOLATION = "23001";
const NOW = new Date("2026-03-10T12:00:00Z");

let database: TestDatabase;

before(async () => {
  database = await createTestDatabase();
});

after(async () => {
  await database.close();
});

let counter = 0;
async function seedHotel(name: string) {
  counter += 1;
  const { db, schema } = database;

  const [place] = await db
    .insert(schema.places)
    .values({ name: `${name} place`, latitude: 41.7, longitude: 44.8, category: "hotel" })
    .returning();
  const [hotel] = await db.insert(schema.hotels).values({ placeId: place.id }).returning();
  const [user] = await db
    .insert(schema.users)
    .values({ email: `deletion-${counter}@example.test`, passwordHash: "x" })
    .returning();

  return { hotel, place, user };
}

describe("a hotel nobody has stayed at", () => {
  it("has nothing blocking it and deletes cleanly", async () => {
    const { hotel } = await seedHotel("Empty");

    const blockers = await countHotelDeletionBlockers(database.db, hotel.id);
    assert.equal(hasHotelDeletionBlockers(blockers), false);

    await database.db.delete(database.schema.hotels).where(eq(database.schema.hotels.id, hotel.id));

    const rows = await database.db
      .select()
      .from(database.schema.hotels)
      .where(eq(database.schema.hotels.id, hotel.id));
    assert.deepEqual(rows, []);
  });
});

describe("a hotel a guest has stayed at", () => {
  it("is refused by the DATABASE, not merely by the application", async () => {
    const { hotel, user } = await seedHotel("Stayed at");
    const { db, schema } = database;

    await db.insert(schema.hotelStays).values({ userId: user.id, hotelId: hotel.id, checkIn: NOW });

    const code = await expectSqlFailure(() => db.delete(schema.hotels).where(eq(schema.hotels.id, hotel.id)));
    assert.equal(code, RESTRICT_VIOLATION, "the guest's stay is not the hotel's to delete");
  });

  it("leaves the stay intact after the refusal", async () => {
    const { hotel, user } = await seedHotel("Intact");
    const { db, schema } = database;

    await db.insert(schema.hotelStays).values({ userId: user.id, hotelId: hotel.id, checkIn: NOW });
    await expectSqlFailure(() => db.delete(schema.hotels).where(eq(schema.hotels.id, hotel.id)));

    const stays = await db.select().from(schema.hotelStays).where(eq(schema.hotelStays.hotelId, hotel.id));
    assert.equal(stays.length, 1);
  });

  it("is reported to the admin as guest history, in plain language", async () => {
    const { hotel, user } = await seedHotel("Reported");
    const { db, schema } = database;

    await db.insert(schema.hotelStays).values({ userId: user.id, hotelId: hotel.id, checkIn: NOW });

    const blockers = await countHotelDeletionBlockers(db, hotel.id);
    assert.equal(blockers.stays, 1);
    assert.equal(blocksOnGuestHistory(blockers), true);
    assert.match(hotelDeletionBlockedMessage(blockers), /1 guest stay/);
    assert.match(hotelDeletionBlockedMessage(blockers), /history/);
  });
});

describe("a hotel with itineraries", () => {
  it("refuses deletion, so completed stops cannot vanish with it", async () => {
    const { hotel, user } = await seedHotel("Planned");
    const { db, schema } = database;

    const [stay] = await db
      .insert(schema.hotelStays)
      .values({ userId: user.id, hotelId: hotel.id, checkIn: NOW, checkOut: NOW })
      .returning();
    const [day] = await db
      .insert(schema.itineraryDays)
      .values({ userId: user.id, hotelId: hotel.id, hotelStayId: stay.id, dayNumber: 1, stopCount: 1 })
      .returning();
    await db.insert(schema.itineraryStops).values({
      dayId: day.id,
      checkInMethod: "gps",
      name: "A completed visit",
      latitude: 41.7,
      longitude: 44.8,
      position: 1,
      visitedAt: NOW,
    });

    const code = await expectSqlFailure(() => db.delete(schema.hotels).where(eq(schema.hotels.id, hotel.id)));
    assert.equal(code, RESTRICT_VIOLATION);

    // The completed stop is still there.
    const stops = await db
      .select()
      .from(schema.itineraryStops)
      .where(eq(schema.itineraryStops.dayId, day.id));
    assert.equal(stops.length, 1);
    assert.notEqual(stops[0].visitedAt, null);
  });
});

describe("a hotel with only its own administrative records", () => {
  it("is still blocked, so an audit trail is not lost to one click", async () => {
    const { hotel } = await seedHotel("Administrative");
    const { db, schema } = database;

    const [partnerPlace] = await db
      .insert(schema.places)
      .values({ name: "A partner", latitude: 41.71, longitude: 44.81, category: "restaurant" })
      .returning();
    await db.insert(schema.hotelPartnerships).values({ hotelId: hotel.id, placeId: partnerPlace.id });

    const blockers = await countHotelDeletionBlockers(db, hotel.id);

    assert.equal(blockers.partnerships, 1);
    assert.equal(hasHotelDeletionBlockers(blockers), true, "the application refuses");
    assert.equal(blocksOnGuestHistory(blockers), false, "but this is the hotel's own data, not a guest's");
  });
});
