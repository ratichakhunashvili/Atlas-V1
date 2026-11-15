import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { buildDailyChoices } from "@/services/advisor/daily-choices";
import { isCheckInMethodAllowed } from "@/services/advisor/check-in-method";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";

/*
 * Migration 0039: how guests check in at a Place (QR only, location only, or both), against the real migrations.
 * The column defaults to both, refuses anything else, and a daily-plan stop built from a stored Place keeps that
 * Place's method, which the check-in rule then enforces.
 */

const CHECK_VIOLATION = "23514";
let database: TestDatabase;
before(async () => {
  database = await createTestDatabase();
});
after(async () => {
  await database.close();
});

async function insertPlace(name: string, extra: Partial<typeof database.schema.places.$inferInsert> = {}) {
  const { db, schema } = database;
  const [place] = await db
    .insert(schema.places)
    .values({ name, latitude: 41.701, longitude: 44.8, category: "restaurant", visitDurationMinutes: 30, ...extra })
    .returning();
  return place;
}

describe("places.check_in_method", () => {
  it("defaults to both (qr_or_gps), so existing and new places keep either way", async () => {
    const place = await insertPlace("Default method");
    assert.equal(place.checkInMethod, "qr_or_gps");
  });

  it("stores QR only and location only", async () => {
    assert.equal((await insertPlace("QR only", { checkInMethod: "qr" })).checkInMethod, "qr");
    assert.equal((await insertPlace("GPS only", { checkInMethod: "gps" })).checkInMethod, "gps");
  });

  it("refuses any other value, including the stop-only methods", async () => {
    for (const value of ["ar", "auto", "both"]) {
      const code = await expectSqlFailure(() =>
        insertPlace(`Bad ${value}`, { checkInMethod: value as "qr" })
      );
      assert.equal(code, CHECK_VIOLATION, value);
    }
  });
});

describe("a daily-plan stop copies its Place's method", () => {
  it("builds the stop from the stored Place and enforces that method", async () => {
    const { db, schema } = database;
    const [hotelPlace] = await db.insert(schema.places).values({ name: "Method hotel", latitude: 41.7, longitude: 44.8, category: "hotel", kind: "hotel" }).returning();
    const [hotel] = await db.insert(schema.hotels).values({ placeId: hotelPlace.id }).returning();
    const [user] = await db.insert(schema.users).values({ email: "method-guest@example.test", passwordHash: "x" }).returning();
    const [stay] = await db.insert(schema.hotelStays).values({ userId: user.id, hotelId: hotel.id, checkIn: new Date("2026-11-10T08:00:00Z") }).returning();
    const [day] = await db
      .insert(schema.itineraryDays)
      .values({ userId: user.id, hotelId: hotel.id, hotelStayId: stay.id, dayNumber: 1, stopCount: 1 })
      .returning();

    const stored = await insertPlace("QR-only cafe", { checkInMethod: "qr" });
    const [place] = await db.select().from(schema.places).where(eq(schema.places.id, stored.id));
    const [choice] = buildDailyChoices({
      eligiblePlaces: [{ place, source: "partner", relationId: "contract", facilityType: null, promotion: null }],
      hotelPlaceId: hotelPlace.id,
      hotelLocation: { lat: 41.7, lng: 44.8 },
      origin: { lat: 41.7, lng: 44.8 },
      categories: ["restaurant"],
      budget: null,
      preferredMaxDistanceMeters: null,
      excludePlaceIds: new Set(),
      remainingMinutes: 120,
      usageHistory: new Map(),
    });
    assert.ok(choice, "the place is offered");
    assert.equal(choice.checkInMethod, "qr");

    const [stop] = await db
      .insert(schema.itineraryStops)
      .values({
        dayId: day.id,
        placeId: choice.placeId,
        checkInMethod: choice.checkInMethod,
        name: choice.name,
        latitude: choice.latitude,
        longitude: choice.longitude,
        position: 1,
      })
      .returning();
    assert.equal(stop.checkInMethod, "qr");
    assert.equal(isCheckInMethodAllowed(stop.checkInMethod, "qr"), true);
    assert.equal(isCheckInMethodAllowed(stop.checkInMethod, "gps"), false);
  });
});
