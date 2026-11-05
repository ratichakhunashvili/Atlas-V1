import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";

/**
 * Plan days belong to one stay (migration 0025). Day numbers restart with each stay, so a guest who
 * comes back to the same hotel must get a fresh Day 1 instead of colliding with the previous stay's.
 */

let database: TestDatabase;
before(async () => {
  database = await createTestDatabase();
});
after(async () => {
  await database.close();
});

async function seedGuestWithTwoStays() {
  const { db, schema } = database;
  const [user] = await db.insert(schema.users).values({ email: "returning@example.test", passwordHash: "x" }).returning();
  const [place] = await db.insert(schema.places).values({ name: "Hotel", latitude: 41.7, longitude: 44.8, category: "hotel" }).returning();
  const [hotel] = await db.insert(schema.hotels).values({ placeId: place.id }).returning();
  const [firstStay] = await db
    .insert(schema.hotelStays)
    .values({ userId: user.id, hotelId: hotel.id, checkIn: new Date("2026-06-15T08:00:00Z"), checkOut: new Date("2026-06-16T08:00:00Z") })
    .returning();
  const [secondStay] = await db
    .insert(schema.hotelStays)
    .values({ userId: user.id, hotelId: hotel.id, checkIn: new Date("2026-07-20T08:00:00Z") })
    .returning();
  return { user, hotel, firstStay, secondStay };
}

describe("itinerary days are unique per stay", () => {
  it("lets a returning guest start Day 1 of a new stay at the same hotel", async () => {
    const { db, schema } = database;
    const { user, hotel, firstStay, secondStay } = await seedGuestWithTwoStays();
    await db.insert(schema.itineraryDays).values({ userId: user.id, hotelId: hotel.id, hotelStayId: firstStay.id, dayNumber: 1, stopCount: 0 });
    await db.insert(schema.itineraryDays).values({ userId: user.id, hotelId: hotel.id, hotelStayId: secondStay.id, dayNumber: 1, stopCount: 0 });

    const days = await db.select().from(schema.itineraryDays);
    assert.equal(days.filter((day) => day.dayNumber === 1).length, 2);
  });

  it("still refuses a second Day 1 within the same stay", async () => {
    const { db, schema } = database;
    const [day] = await db.select().from(schema.itineraryDays).limit(1);
    const code = await expectSqlFailure(() =>
      db
        .insert(schema.itineraryDays)
        .values({ userId: day.userId, hotelId: day.hotelId, hotelStayId: day.hotelStayId, dayNumber: day.dayNumber, stopCount: 0 })
    );
    assert.equal(code, "23505");
  });
});
