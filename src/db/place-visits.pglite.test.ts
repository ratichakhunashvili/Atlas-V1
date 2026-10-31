import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";
import {
  hasVisitedPlace,
  listAchievementUnlocksForUser,
  listPlaceVisitsForUser,
  recordVerifiedVisit,
} from "./operations/place-visits";

/**
 * Permanent visits and achievement unlocks, through the real production
 * operation against an in-memory Postgres built from the checked-in migrations.
 *
 * PGlite serialises statements: these prove the constraints and the idempotent
 * upsert/on-conflict semantics, NOT behaviour under genuinely parallel requests.
 */

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
const RESTRICT_VIOLATION = "23001";

const FIRST = new Date("2026-03-10T12:00:00Z");
const LATER = new Date("2026-03-12T15:00:00Z");

let database: TestDatabase;

before(async () => {
  database = await createTestDatabase();
});

after(async () => {
  await database.close();
});

let counter = 0;
async function seedUser() {
  counter += 1;
  const [user] = await database.db
    .insert(database.schema.users)
    .values({ email: `visitor-${counter}@example.test`, passwordHash: "x" })
    .returning();
  return user;
}

async function seedPlace(name: string) {
  const [place] = await database.db
    .insert(database.schema.places)
    .values({ name, latitude: 41.7, longitude: 44.8, category: "museum" })
    .returning();
  return place;
}

async function seedAchievement(placeId: string, name = "First visit") {
  const [achievement] = await database.db
    .insert(database.schema.achievements)
    .values({ placeId, name })
    .returning();
  return achievement;
}

describe("recording a verified visit", () => {
  it("creates the visit and says it was the first", async () => {
    const user = await seedUser();
    const place = await seedPlace("A museum");

    const result = await recordVerifiedVisit(database.db, {
      userId: user.id,
      placeId: place.id,
      method: "gps",
      now: FIRST,
    });

    assert.equal(result.firstVisit, true);
    assert.equal(result.visit.visitCount, 1);
    assert.equal(result.visit.firstVerificationMethod, "gps");
    assert.equal(result.visit.firstVisitedAt.toISOString(), FIRST.toISOString());
  });

  it("is idempotent: visiting again updates the one row rather than forking history", async () => {
    const user = await seedUser();
    const place = await seedPlace("Revisited");

    await recordVerifiedVisit(database.db, { userId: user.id, placeId: place.id, method: "gps", now: FIRST });
    const second = await recordVerifiedVisit(database.db, {
      userId: user.id,
      placeId: place.id,
      method: "qr",
      now: LATER,
    });

    assert.equal(second.firstVisit, false);
    assert.equal(second.visit.visitCount, 2);
    assert.equal(second.visit.firstVisitedAt.toISOString(), FIRST.toISOString(), "the first arrival never moves");
    assert.equal(second.visit.lastVisitedAt.toISOString(), LATER.toISOString());
    assert.equal(second.visit.firstVerificationMethod, "gps", "the original evidence is preserved");

    const rows = await listPlaceVisitsForUser(database.db, user.id);
    assert.equal(rows.length, 1, "one row per user per Place, for ever");
  });

  it("refuses a second row for the same user and Place even if inserted directly", async () => {
    const user = await seedUser();
    const place = await seedPlace("Constrained");
    const { db, schema } = database;

    await recordVerifiedVisit(db, { userId: user.id, placeId: place.id, method: "gps", now: FIRST });

    const code = await expectSqlFailure(() =>
      db.insert(schema.placeVisits).values({
        userId: user.id,
        placeId: place.id,
        firstVisitedAt: FIRST,
        lastVisitedAt: FIRST,
        firstVerificationMethod: "gps",
      })
    );
    assert.equal(code, UNIQUE_VIOLATION);
  });

  it("keeps each guest's history to themselves", async () => {
    const mine = await seedUser();
    const theirs = await seedUser();
    const place = await seedPlace("Shared place");

    await recordVerifiedVisit(database.db, { userId: theirs.id, placeId: place.id, method: "gps", now: FIRST });

    assert.equal(await hasVisitedPlace(database.db, theirs.id, place.id), true);
    assert.equal(await hasVisitedPlace(database.db, mine.id, place.id), false);
    assert.deepEqual(await listPlaceVisitsForUser(database.db, mine.id), []);
  });
});

describe("unlocking a badge", () => {
  it("unlocks on the visit that earned it, and reports the achievement once", async () => {
    const user = await seedUser();
    const place = await seedPlace("Badge place");
    const achievement = await seedAchievement(place.id, "Museum regular");

    const first = await recordVerifiedVisit(database.db, {
      userId: user.id,
      placeId: place.id,
      method: "gps",
      now: FIRST,
    });

    assert.equal(first.unlockedAchievement?.id, achievement.id);

    const unlocks = await listAchievementUnlocksForUser(database.db, user.id);
    assert.equal(unlocks.length, 1);
    assert.equal(unlocks[0].unlock.verificationMethod, "gps");
    assert.equal(unlocks[0].unlock.placeVisitId, first.visit.id, "the badge points at the evidence that earned it");
  });

  it("never unlocks twice, and never repeats the celebration", async () => {
    const user = await seedUser();
    const place = await seedPlace("Repeat badge place");
    await seedAchievement(place.id);

    await recordVerifiedVisit(database.db, { userId: user.id, placeId: place.id, method: "gps", now: FIRST });
    const second = await recordVerifiedVisit(database.db, {
      userId: user.id,
      placeId: place.id,
      method: "gps",
      now: LATER,
    });

    assert.equal(second.unlockedAchievement, null, "the second visit earns nothing new");

    const unlocks = await listAchievementUnlocksForUser(database.db, user.id);
    assert.equal(unlocks.length, 1);
    assert.equal(unlocks[0].unlock.unlockedAt.toISOString(), FIRST.toISOString(), "it keeps when it was earned");
  });

  it("records a visit to a Place with no badge, and unlocks nothing", async () => {
    const user = await seedUser();
    const place = await seedPlace("No badge here");

    const result = await recordVerifiedVisit(database.db, {
      userId: user.id,
      placeId: place.id,
      method: "qr",
      now: FIRST,
    });

    assert.equal(result.unlockedAchievement, null);
    assert.equal(result.visit.visitCount, 1, "the visit still counts");
  });

  it("allows at most one achievement per Place", async () => {
    const place = await seedPlace("One badge only");
    await seedAchievement(place.id, "The badge");

    const code = await expectSqlFailure(() =>
      database.db.insert(database.schema.achievements).values({ placeId: place.id, name: "A second badge" })
    );
    assert.equal(code, UNIQUE_VIOLATION);
  });

  it("refuses a blank achievement name", async () => {
    const place = await seedPlace("Blank name place");

    const code = await expectSqlFailure(() =>
      database.db.insert(database.schema.achievements).values({ placeId: place.id, name: "   " })
    );
    assert.equal(code, CHECK_VIOLATION);
  });
});

describe("history outlives everything around it", () => {
  it("survives the itinerary that produced it being superseded", async () => {
    const user = await seedUser();
    const place = await seedPlace("Superseded plan place");
    const { db, schema } = database;

    // A hotel, stay and day, with a stop that gets superseded afterwards.
    const [hotelPlace] = await db
      .insert(schema.places)
      .values({ name: "Visit hotel", latitude: 41.7, longitude: 44.8, category: "hotel" })
      .returning();
    const [hotel] = await db.insert(schema.hotels).values({ placeId: hotelPlace.id }).returning();
    const [stay] = await db
      .insert(schema.hotelStays)
      .values({ userId: user.id, hotelId: hotel.id, checkIn: FIRST })
      .returning();
    const [day] = await db
      .insert(schema.itineraryDays)
      .values({ userId: user.id, hotelId: hotel.id, hotelStayId: stay.id, dayNumber: 1, stopCount: 1 })
      .returning();
    const [stop] = await db
      .insert(schema.itineraryStops)
      .values({
        dayId: day.id,
        placeId: place.id,
        checkInMethod: "gps",
        name: "A stop",
        latitude: 41.7,
        longitude: 44.8,
        position: 1,
      })
      .returning();

    await recordVerifiedVisit(db, { userId: user.id, placeId: place.id, method: "gps", now: FIRST });

    // The stop is superseded by a repair (it was pending, so this is allowed).
    await db
      .update(schema.itineraryStops)
      .set({ supersededAt: LATER, supersededReason: "plan_regenerated" })
      .where(eq(schema.itineraryStops.id, stop.id));

    assert.equal(await hasVisitedPlace(db, user.id, place.id), true, "the repair cannot unvisit a place");
  });

  it("stops a visited Place from being deleted out from under it", async () => {
    const user = await seedUser();
    const place = await seedPlace("Protected by a visit");

    await recordVerifiedVisit(database.db, { userId: user.id, placeId: place.id, method: "gps", now: FIRST });

    const code = await expectSqlFailure(() =>
      database.db.delete(database.schema.places).where(eq(database.schema.places.id, place.id))
    );
    assert.equal(code, RESTRICT_VIOLATION, "archive the Place instead; the visit happened");
  });

  it("stops the visit that earned a badge from being deleted", async () => {
    const user = await seedUser();
    const place = await seedPlace("Badge evidence place");
    await seedAchievement(place.id);

    const result = await recordVerifiedVisit(database.db, {
      userId: user.id,
      placeId: place.id,
      method: "gps",
      now: FIRST,
    });

    const code = await expectSqlFailure(() =>
      database.db.delete(database.schema.placeVisits).where(eq(database.schema.placeVisits.id, result.visit.id))
    );
    assert.equal(code, RESTRICT_VIOLATION, "the badge's evidence must remain");
  });

  it("stores no points, level or streak — achievements are unlocks, not an economy", async () => {
    const columns = await database.db.execute(
      sql`select column_name from information_schema.columns where table_name in ('achievements', 'achievement_unlocks', 'place_visits')`
    );
    const names = (columns.rows as Array<{ column_name: string }>).map((row) => row.column_name);

    for (const forbidden of ["points", "score", "xp", "level", "streak", "rank"]) {
      assert.equal(names.includes(forbidden), false, `${forbidden} has no place in an unlock model`);
    }
  });
});
