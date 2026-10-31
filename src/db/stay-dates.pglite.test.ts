import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";
import { stayHasItineraryDays, updateStayDates } from "./operations/hotel-stays";

/**
 * Declared stay dates against the real migrations (0015): the source defaults to "guest_declared", a departure
 * can be set without ending the stay, a guest can never overwrite verified dates or another guest's stay, and
 * the arrival lock is read from real itinerary rows.
 */

const CHECK_VIOLATION = "23514";
let database: TestDatabase;

before(async () => {
  database = await createTestDatabase();
});

after(async () => {
  await database.close();
});

async function seed(email: string) {
  const { db, schema } = database;
  const [user] = await db.insert(schema.users).values({ email, passwordHash: "x" }).returning();
  const [place] = await db
    .insert(schema.places)
    .values({ name: `Hotel for ${email}`, latitude: 41.7, longitude: 44.8, category: "hotel" })
    .returning();
  const [hotel] = await db.insert(schema.hotels).values({ placeId: place.id }).returning();
  const [stay] = await db
    .insert(schema.hotelStays)
    .values({ userId: user.id, hotelId: hotel.id, checkIn: new Date("2026-10-19T09:00:00Z") })
    .returning();
  return { user, hotel, stay };
}

const CHECK_IN = new Date("2026-10-18T00:00:00Z");
const DEPARTURE = new Date("2026-10-22T00:00:00Z");

describe("declared stay dates", () => {
  it("defaults a stay's dates to guest-declared with no departure, and the stay stays active", async () => {
    const { stay } = await seed("defaults@example.test");
    assert.equal(stay.datesSource, "guest_declared");
    assert.equal(stay.expectedCheckOut, null);
    assert.equal(stay.checkOut, null);
  });

  it("saves both dates on the guest's own active stay without ending it", async () => {
    const { user, stay } = await seed("save@example.test");
    const saved = await updateStayDates(database.db, {
      userId: user.id,
      stayId: stay.id,
      checkIn: CHECK_IN,
      expectedCheckOut: DEPARTURE,
    });
    assert.equal(saved?.checkIn.toISOString(), CHECK_IN.toISOString());
    assert.equal(saved?.expectedCheckOut?.toISOString(), DEPARTURE.toISOString());
    assert.equal(saved?.checkOut, null, "a declared departure never ends the stay");
    assert.equal(saved?.datesSource, "guest_declared");
  });

  it("cannot write to another guest's stay", async () => {
    const owner = await seed("owner@example.test");
    const intruder = await seed("intruder@example.test");
    const result = await updateStayDates(database.db, {
      userId: intruder.user.id,
      stayId: owner.stay.id,
      checkIn: CHECK_IN,
      expectedCheckOut: DEPARTURE,
    });
    assert.equal(result, null);
  });

  it("never overwrites dates a verified source supplied", async () => {
    const { user, stay } = await seed("verified@example.test");
    const { db, schema } = database;
    await db.update(schema.hotelStays).set({ datesSource: "verified" });
    const result = await updateStayDates(db, { userId: user.id, stayId: stay.id, checkIn: CHECK_IN, expectedCheckOut: DEPARTURE });
    assert.equal(result, null);
  });

  it("refuses a departure on or before arrival, and an unknown source, in the database itself", async () => {
    const { user, stay } = await seed("db-guards@example.test");
    const { db, schema } = database;
    assert.equal(
      await expectSqlFailure(() =>
        updateStayDates(db, { userId: user.id, stayId: stay.id, checkIn: DEPARTURE, expectedCheckOut: CHECK_IN })
      ),
      CHECK_VIOLATION
    );
    assert.equal(
      await expectSqlFailure(() => db.update(schema.hotelStays).set({ datesSource: "self_certified" as never })),
      CHECK_VIOLATION
    );
  });

  it("reports the arrival lock from real itinerary rows", async () => {
    const { user, hotel } = await seed("lock@example.test");
    const { db, schema } = database;
    assert.equal(await stayHasItineraryDays(db, { userId: user.id, hotelId: hotel.id }), false);

    await db.insert(schema.itineraryDays).values({
      userId: user.id,
      hotelId: hotel.id,
      dayNumber: 1,
      stopCount: 0,
      generatedAt: new Date(),
    });
    assert.equal(await stayHasItineraryDays(db, { userId: user.id, hotelId: hotel.id }), true);
  });
});
