import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";
import { HASH_HEX_LENGTH } from "@/services/ar/hash";
import {
  listAchievementUnlocksForUser,
  listPlaceVisitsForUser,
  recordVerifiedVisit,
} from "./operations/place-visits";

/**
 * Migration 0012, against an in-memory Postgres built from the checked-in
 * migrations.
 *
 * Two things are worth proving at this level rather than in TypeScript: that the
 * table genuinely cannot hold a malformed hash or two targets for one Place, and
 * that widening the check-in method CHECKs to accept 'ar' did not quietly let
 * anything else through.
 *
 * PGlite serialises statements — constraints and semantics only, never parallel
 * behaviour. No camera, no image and no browser code is exercised here.
 */

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";

const VALID_HASH = "a".repeat(HASH_HEX_LENGTH);
const OTHER_HASH = "b".repeat(HASH_HEX_LENGTH);

let database: TestDatabase;

before(async () => {
  database = await createTestDatabase();
});

after(async () => {
  await database.close();
});

let counter = 0;

async function seedPlace() {
  counter += 1;
  const [place] = await database.db
    .insert(database.schema.places)
    .values({ name: `AR Place ${counter}`, latitude: 41.7151, longitude: 44.8271, category: "landmark" })
    .returning();
  return place;
}

describe("the AR target table", () => {
  it("stores a reference hash for a Place", async () => {
    const place = await seedPlace();

    const [row] = await database.db
      .insert(database.schema.placeArTargets)
      .values({ placeId: place.id, targetHash: VALID_HASH, description: "front entrance" })
      .returning();

    assert.equal(row.targetHash, VALID_HASH);
    assert.equal(row.placeId, place.id);
  });

  it("allows only one target per Place", async () => {
    const place = await seedPlace();
    await database.db
      .insert(database.schema.placeArTargets)
      .values({ placeId: place.id, targetHash: VALID_HASH })
      .returning();

    const code = await expectSqlFailure(() =>
      database.db.insert(database.schema.placeArTargets).values({ placeId: place.id, targetHash: OTHER_HASH })
    );

    // Two targets would make "which one did it match?" ambiguous.
    assert.equal(code, UNIQUE_VIOLATION);
  });

  it("refuses a malformed hash, whatever route the write came from", async () => {
    const malformed = [
      "a".repeat(HASH_HEX_LENGTH - 1),
      "a".repeat(HASH_HEX_LENGTH + 1),
      "A".repeat(HASH_HEX_LENGTH),
      `${"a".repeat(HASH_HEX_LENGTH - 1)}z`,
      "",
    ];

    for (const targetHash of malformed) {
      const place = await seedPlace();
      const code = await expectSqlFailure(() =>
        database.db.insert(database.schema.placeArTargets).values({ placeId: place.id, targetHash })
      );
      assert.equal(code, CHECK_VIOLATION, `"${targetHash.slice(0, 8)}…" must be refused by the database itself`);
    }
  });

  it("disappears with its Place, since it describes nothing on its own", async () => {
    const place = await seedPlace();
    await database.db.insert(database.schema.placeArTargets).values({ placeId: place.id, targetHash: VALID_HASH });

    await database.db.delete(database.schema.places).where(eq(database.schema.places.id, place.id));

    const remaining = await database.db
      .select()
      .from(database.schema.placeArTargets)
      .where(eq(database.schema.placeArTargets.placeId, place.id));

    assert.deepEqual(remaining, []);
  });

  it("stores no column capable of holding an image", async () => {
    const columns = await database.db.execute(
      sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'place_ar_targets'`
    );
    const rows = columns.rows as { column_name: string; data_type: string }[];

    assert.deepEqual(
      rows.filter((row) => row.data_type === "bytea").map((row) => row.column_name),
      [],
      "the AR feature stores a fingerprint and nothing else"
    );
    assert.deepEqual(
      rows.map((row) => row.column_name).filter((name) => /image|photo|blob|storage/.test(name)),
      []
    );
  });
});

describe("migration 0012 widened the check-in method rules without loosening them", () => {
  async function allowedMethods(table: string, insert: (method: string) => Promise<unknown>) {
    const accepted: string[] = [];
    for (const method of ["gps", "qr", "ar", "auto", "nfc", "", "AR"]) {
      try {
        await insert(method);
        accepted.push(method);
      } catch {
        // Refused by the CHECK, which is the point of the test.
      }
    }
    return accepted;
  }

  it("accepts exactly gps, qr, ar and auto on itinerary_stops", async () => {
    const place = await seedPlace();
    const [user] = await database.db
      .insert(database.schema.users)
      .values({ email: `ar-method-${Date.now()}@example.test`, passwordHash: "x" })
      .returning();
    const [hotel] = await database.db
      .insert(database.schema.hotels)
      .values({ placeId: (await seedPlace()).id })
      .returning();
    const [stay] = await database.db
      .insert(database.schema.hotelStays)
      .values({ userId: user.id, hotelId: hotel.id, checkIn: new Date("2026-03-10T08:00:00Z") })
      .returning();
    const [day] = await database.db
      .insert(database.schema.itineraryDays)
      .values({ userId: user.id, hotelId: hotel.id, hotelStayId: stay.id, dayNumber: 1, stopCount: 0 })
      .returning();

    let position = 0;
    const accepted = await allowedMethods("itinerary_stops", async (checkInMethod) => {
      position += 1;
      return database.db.insert(database.schema.itineraryStops).values({
        dayId: day.id,
        placeId: place.id,
        name: "Stop",
        latitude: 41.7151,
        longitude: 44.8271,
        position,
        // Cast through unknown deliberately: the point is to try values the
        // TypeScript union forbids, and prove the DATABASE refuses them too.
        checkInMethod: checkInMethod as never,
      });
    });

    assert.deepEqual(accepted.sort(), ["ar", "auto", "gps", "qr"]);
  });
});

describe("an AR visit survives the whole write path", () => {
  it("records the visit AND the unlock with method 'ar', through the real operation", async () => {
    // Not a theoretical concern: if either widened CHECK were wrong, an AR
    // check-in would mark the stop visited and only then throw, leaving a
    // completed stop with no visit behind it.
    const place = await seedPlace();
    const [user] = await database.db
      .insert(database.schema.users)
      .values({ email: `ar-visitor-${Date.now()}@example.test`, passwordHash: "x" })
      .returning();
    const [achievement] = await database.db
      .insert(database.schema.achievements)
      .values({ placeId: place.id, name: "Seen through a lens" })
      .returning();

    const result = await recordVerifiedVisit(database.db, {
      userId: user.id,
      placeId: place.id,
      method: "ar",
      now: new Date("2026-03-10T12:00:00Z"),
    });

    assert.equal(result.firstVisit, true);
    assert.equal(result.visit.firstVerificationMethod, "ar");
    assert.equal(result.unlockedAchievement?.id, achievement.id);

    const visits = await listPlaceVisitsForUser(database.db, user.id);
    assert.equal(visits.length, 1);

    const unlocks = await listAchievementUnlocksForUser(database.db, user.id);
    assert.equal(unlocks.length, 1);
    assert.equal(unlocks[0].unlock.verificationMethod, "ar");
  });

  it("is idempotent for AR too: a second capture adds no second unlock", async () => {
    const place = await seedPlace();
    const [user] = await database.db
      .insert(database.schema.users)
      .values({ email: `ar-twice-${Date.now()}@example.test`, passwordHash: "x" })
      .returning();
    await database.db
      .insert(database.schema.achievements)
      .values({ placeId: place.id, name: "Seen twice" });

    await recordVerifiedVisit(database.db, {
      userId: user.id,
      placeId: place.id,
      method: "ar",
      now: new Date("2026-03-10T12:00:00Z"),
    });
    const second = await recordVerifiedVisit(database.db, {
      userId: user.id,
      placeId: place.id,
      method: "ar",
      now: new Date("2026-03-11T12:00:00Z"),
    });

    assert.equal(second.firstVisit, false);
    assert.equal(second.unlockedAchievement, null, "the celebration must not repeat");
    assert.equal((await listAchievementUnlocksForUser(database.db, user.id)).length, 1);
  });
});
