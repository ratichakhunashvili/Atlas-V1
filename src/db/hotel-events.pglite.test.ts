import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";

/**
 * Database-level proof for migration 0007: the time-aware Advisor's columns and
 * the hotel_events table. In-memory PGlite built from the checked-in migrations;
 * never a remote or shared database.
 */

const CHECK_VIOLATION = "23514";
const FK_VIOLATION = "23503";
/** ON DELETE RESTRICT raises restrict_violation, which is distinct from a plain foreign-key violation. */
const RESTRICT_VIOLATION = "23001";

let database: TestDatabase;

before(async () => {
  database = await createTestDatabase();
});

after(async () => {
  await database.close();
});

async function seedHotelWithVenue(name: string) {
  const { db, schema } = database;

  const [hotelPlace] = await db
    .insert(schema.places)
    .values({ name: `${name} hotel place`, latitude: 41.7, longitude: 44.8, category: "hotel" })
    .returning();
  const [hotel] = await db.insert(schema.hotels).values({ placeId: hotelPlace.id }).returning();
  const [venue] = await db
    .insert(schema.places)
    .values({ name: `${name} venue`, latitude: 41.71, longitude: 44.81, category: "restaurant" })
    .returning();

  return { hotel, venue };
}

describe("migration 0007", () => {
  it("adds the new columns as nullable, so existing rows are untouched", async () => {
    const result = await database.db.execute(sql`
      select table_name, column_name, is_nullable
      from information_schema.columns
      where (table_name = 'places' and column_name = 'visit_duration_minutes')
         or (table_name = 'itinerary_days' and column_name = 'available_minutes')
         or (table_name = 'itinerary_stops' and column_name = 'visit_duration_minutes')
      order by table_name, column_name
    `);

    assert.equal(result.rows.length, 3, "all three columns exist");
    for (const row of result.rows as Array<{ is_nullable: string }>) {
      assert.equal(row.is_nullable, "YES", "a plan made before this migration must stay valid");
    }
  });

  it("creates hotel_events", async () => {
    const result = await database.db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_name = 'hotel_events'`
    );
    assert.equal(result.rows.length, 1);
  });
});

describe("a Place's configured visit duration", () => {
  it("accepts a sensible value and defaults to unset", async () => {
    const { db, schema } = database;

    const [unset] = await db
      .insert(schema.places)
      .values({ name: "Unset duration", latitude: 41.7, longitude: 44.8, category: "museum" })
      .returning();
    assert.equal(unset.visitDurationMinutes, null, "unset means 'use the category estimate', not zero");

    const [configured] = await db
      .insert(schema.places)
      .values({ name: "Configured duration", latitude: 41.7, longitude: 44.8, category: "museum", visitDurationMinutes: 45 })
      .returning();
    assert.equal(configured.visitDurationMinutes, 45);
  });

  it("refuses zero and negative values — a stop always costs the guest time", async () => {
    for (const bad of [0, -30]) {
      const code = await expectSqlFailure(() =>
        database.db
          .insert(database.schema.places)
          .values({ name: `Bad ${bad}`, latitude: 41.7, longitude: 44.8, category: "museum", visitDurationMinutes: bad })
      );
      assert.equal(code, CHECK_VIOLATION);
    }
  });

  it("refuses a value longer than a day, which is a data-entry mistake", async () => {
    const code = await expectSqlFailure(() =>
      database.db
        .insert(database.schema.places)
        .values({ name: "Too long", latitude: 41.7, longitude: 44.8, category: "museum", visitDurationMinutes: 1441 })
    );
    assert.equal(code, CHECK_VIOLATION);
  });
});

describe("hotel events", () => {
  it("records a scheduled event against its hotel and venue Place", async () => {
    const { hotel, venue } = await seedHotelWithVenue("Scheduled");

    const [event] = await database.db
      .insert(database.schema.hotelEvents)
      .values({
        hotelId: hotel.id,
        venuePlaceId: venue.id,
        title: "Wine tasting",
        startsAt: new Date("2026-10-20T18:00:00Z"),
        endsAt: new Date("2026-10-20T19:30:00Z"),
      })
      .returning();

    assert.equal(event.status, "scheduled", "events start scheduled");
    assert.equal(event.venuePlaceId, venue.id, "location comes from the canonical Place, not a copy");
  });

  it("refuses an event that ends before it starts", async () => {
    const { hotel, venue } = await seedHotelWithVenue("Backwards");

    const code = await expectSqlFailure(() =>
      database.db.insert(database.schema.hotelEvents).values({
        hotelId: hotel.id,
        venuePlaceId: venue.id,
        title: "Impossible",
        startsAt: new Date("2026-10-20T19:00:00Z"),
        endsAt: new Date("2026-10-20T18:00:00Z"),
      })
    );
    assert.equal(code, CHECK_VIOLATION);
  });

  it("refuses an event with no duration at all", async () => {
    const { hotel, venue } = await seedHotelWithVenue("Instant");
    const at = new Date("2026-10-20T19:00:00Z");

    const code = await expectSqlFailure(() =>
      database.db
        .insert(database.schema.hotelEvents)
        .values({ hotelId: hotel.id, venuePlaceId: venue.id, title: "Instant", startsAt: at, endsAt: at })
    );
    assert.equal(code, CHECK_VIOLATION);
  });

  it("refuses a status outside the allowed set", async () => {
    const { hotel, venue } = await seedHotelWithVenue("Bad status");

    const code = await expectSqlFailure(() =>
      database.db.execute(sql`
        insert into hotel_events (hotel_id, venue_place_id, title, starts_at, ends_at, status)
        values (${hotel.id}, ${venue.id}, 'Bad', '2026-10-20T18:00:00Z', '2026-10-20T19:00:00Z', 'postponed')
      `)
    );
    assert.equal(code, CHECK_VIOLATION);
  });

  it("refuses an event at a Place that does not exist", async () => {
    const { hotel } = await seedHotelWithVenue("Missing venue");

    const code = await expectSqlFailure(() =>
      database.db.insert(database.schema.hotelEvents).values({
        hotelId: hotel.id,
        venuePlaceId: "00000000-0000-4000-8000-000000000000",
        title: "Nowhere",
        startsAt: new Date("2026-10-20T18:00:00Z"),
        endsAt: new Date("2026-10-20T19:00:00Z"),
      })
    );
    assert.equal(code, FK_VIOLATION);
  });

  it("protects a venue that has events: it must be archived, not deleted", async () => {
    const { hotel, venue } = await seedHotelWithVenue("Protected venue");
    const { db, schema } = database;

    await db.insert(schema.hotelEvents).values({
      hotelId: hotel.id,
      venuePlaceId: venue.id,
      title: "Recurring supper",
      startsAt: new Date("2026-10-20T18:00:00Z"),
      endsAt: new Date("2026-10-20T19:00:00Z"),
    });

    const code = await expectSqlFailure(() => db.delete(schema.places).where(eq(schema.places.id, venue.id)));
    assert.equal(code, RESTRICT_VIOLATION, "deleting the venue would erase where the event happened");
  });

  it("cancels rather than deletes, so a guest's saved plan keeps its history", async () => {
    const { hotel, venue } = await seedHotelWithVenue("Cancellable");
    const { db, schema } = database;

    const [event] = await db
      .insert(schema.hotelEvents)
      .values({
        hotelId: hotel.id,
        venuePlaceId: venue.id,
        title: "Rooftop jazz",
        startsAt: new Date("2026-10-20T18:00:00Z"),
        endsAt: new Date("2026-10-20T19:00:00Z"),
      })
      .returning();

    await db.update(schema.hotelEvents).set({ status: "cancelled" }).where(eq(schema.hotelEvents.id, event.id));

    const [after] = await db.select().from(schema.hotelEvents).where(eq(schema.hotelEvents.id, event.id));
    assert.equal(after.status, "cancelled");
    assert.equal(after.title, "Rooftop jazz", "the row survives so history still reads correctly");
  });
});

describe("a saved plan's own time record", () => {
  it("stores the window and each stop's expected visit time", async () => {
    const { hotel } = await seedHotelWithVenue("Planned");
    const { db, schema } = database;

    const [guest] = await db
      .insert(schema.users)
      .values({ email: "planned@example.test", passwordHash: "x" })
      .returning();
    const [stay] = await db
      .insert(schema.hotelStays)
      .values({ userId: guest.id, hotelId: hotel.id, checkIn: new Date("2026-10-19T12:00:00Z") })
      .returning();

    const [day] = await db
      .insert(schema.itineraryDays)
      .values({
        userId: guest.id,
        hotelId: hotel.id,
        hotelStayId: stay.id,
        dayNumber: 1,
        stopCount: 1,
        availableMinutes: 120,
      })
      .returning();

    const [stop] = await db
      .insert(schema.itineraryStops)
      .values({
        dayId: day.id,
        checkInMethod: "gps",
        name: "A museum",
        latitude: 41.71,
        longitude: 44.81,
        position: 1,
        visitDurationMinutes: 45,
      })
      .returning();

    assert.equal(day.availableMinutes, 120);
    assert.equal(stop.visitDurationMinutes, 45);
  });
});
