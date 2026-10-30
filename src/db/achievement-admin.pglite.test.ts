import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";
import {
  countUnlocksForAchievement,
  deleteAchievementIfUnearned,
  findAchievement,
  listAchievementsWithUsage,
} from "./operations/achievements";
import { recordVerifiedVisit } from "./operations/place-visits";

/**
 * Badge administration against the real operations and the real constraints.
 *
 * The question these answer is the one that matters for this screen: can an admin
 * action destroy a guest's record of something they earned? PGlite serialises
 * statements, so nothing here claims anything about parallel load.
 */

const RESTRICT_VIOLATION = "23001";
const UNIQUE_VIOLATION = "23505";
const NOW = new Date("2026-03-10T12:00:00Z");

let database: TestDatabase;

before(async () => {
  database = await createTestDatabase();
});

after(async () => {
  await database.close();
});

let counter = 0;
async function seedPlace(name: string) {
  const [place] = await database.db
    .insert(database.schema.places)
    .values({ name, latitude: 41.7, longitude: 44.8, category: "museum" })
    .returning();
  return place;
}

async function seedUser() {
  counter += 1;
  const [user] = await database.db
    .insert(database.schema.users)
    .values({ email: `badge-admin-${counter}@example.test`, passwordHash: "x" })
    .returning();
  return user;
}

async function seedAchievement(placeId: string, name = "A badge") {
  const [achievement] = await database.db
    .insert(database.schema.achievements)
    .values({ placeId, name })
    .returning();
  return achievement;
}

describe("an unearned badge", () => {
  it("can be deleted", async () => {
    const place = await seedPlace("Deletable badge place");
    const achievement = await seedAchievement(place.id);

    const result = await deleteAchievementIfUnearned(database.db, achievement.id);

    assert.equal(result.status, "deleted");
    assert.equal(await findAchievement(database.db, achievement.id), null);
  });

  it("reports a missing badge rather than pretending to delete one", async () => {
    const result = await deleteAchievementIfUnearned(database.db, "00000000-0000-4000-8000-000000000000");
    assert.equal(result.status, "not_found");
  });
});

describe("an earned badge", () => {
  it("is refused deletion, and says how many guests hold it", async () => {
    const place = await seedPlace("Earned badge place");
    const achievement = await seedAchievement(place.id);
    const guest = await seedUser();

    await recordVerifiedVisit(database.db, { userId: guest.id, placeId: place.id, method: "gps", now: NOW });

    const result = await deleteAchievementIfUnearned(database.db, achievement.id);

    assert.equal(result.status, "has_unlocks");
    assert.equal(result.status === "has_unlocks" && result.unlocks, 1);
  });

  it("survives the refusal with its unlock and the visit behind it intact", async () => {
    const place = await seedPlace("Survives place");
    const achievement = await seedAchievement(place.id);
    const guest = await seedUser();

    await recordVerifiedVisit(database.db, { userId: guest.id, placeId: place.id, method: "qr", now: NOW });
    await deleteAchievementIfUnearned(database.db, achievement.id);

    const stillThere = await findAchievement(database.db, achievement.id);
    assert.notEqual(stillThere, null);

    const unlocks = await database.db
      .select()
      .from(database.schema.achievementUnlocks)
      .where(eq(database.schema.achievementUnlocks.achievementId, achievement.id));
    assert.equal(unlocks.length, 1);

    const visits = await database.db
      .select()
      .from(database.schema.placeVisits)
      .where(eq(database.schema.placeVisits.userId, guest.id));
    assert.equal(visits.length, 1, "the evidence behind the badge is untouched");
  });

  it("cannot be force-deleted around the operation either", async () => {
    const place = await seedPlace("Force delete place");
    const achievement = await seedAchievement(place.id);
    const guest = await seedUser();

    await recordVerifiedVisit(database.db, { userId: guest.id, placeId: place.id, method: "gps", now: NOW });

    // Straight at the table, bypassing the guarded operation entirely.
    const code = await expectSqlFailure(() =>
      database.db.delete(database.schema.achievements).where(eq(database.schema.achievements.id, achievement.id))
    );
    assert.equal(code, RESTRICT_VIOLATION, "the schema refuses, not just the application");
  });

  it("can still be renamed: editing changes how it looks, never whether it was earned", async () => {
    const place = await seedPlace("Renamed badge place");
    const achievement = await seedAchievement(place.id, "Original name");
    const guest = await seedUser();

    await recordVerifiedVisit(database.db, { userId: guest.id, placeId: place.id, method: "gps", now: NOW });

    await database.db
      .update(database.schema.achievements)
      .set({ name: "Better name", updatedAt: NOW })
      .where(eq(database.schema.achievements.id, achievement.id));

    const unlocks = await database.db
      .select()
      .from(database.schema.achievementUnlocks)
      .where(eq(database.schema.achievementUnlocks.achievementId, achievement.id));

    assert.equal(unlocks.length, 1, "the guest still holds it");
    assert.equal((await findAchievement(database.db, achievement.id))?.name, "Better name");
  });
});

describe("the admin listing", () => {
  it("counts how many guests hold each badge, including none", async () => {
    const earnedPlace = await seedPlace("Listing earned place");
    const unearnedPlace = await seedPlace("Listing unearned place");
    const earned = await seedAchievement(earnedPlace.id, "Earned badge");
    const unearned = await seedAchievement(unearnedPlace.id, "Unearned badge");

    const guestOne = await seedUser();
    const guestTwo = await seedUser();
    await recordVerifiedVisit(database.db, { userId: guestOne.id, placeId: earnedPlace.id, method: "gps", now: NOW });
    await recordVerifiedVisit(database.db, { userId: guestTwo.id, placeId: earnedPlace.id, method: "gps", now: NOW });

    const rows = await listAchievementsWithUsage(database.db);
    const earnedRow = rows.find((row) => row.achievement.id === earned.id);
    const unearnedRow = rows.find((row) => row.achievement.id === unearned.id);

    assert.equal(earnedRow?.unlocks, 2);
    assert.equal(unearnedRow?.unlocks, 0);
    assert.equal(earnedRow?.placeName, "Listing earned place");
  });

  it("counts a badge earned repeatedly by one guest only once", async () => {
    const place = await seedPlace("Repeat earner place");
    const achievement = await seedAchievement(place.id, "Repeat badge");
    const guest = await seedUser();

    await recordVerifiedVisit(database.db, { userId: guest.id, placeId: place.id, method: "gps", now: NOW });
    await recordVerifiedVisit(database.db, {
      userId: guest.id,
      placeId: place.id,
      method: "gps",
      now: new Date(NOW.getTime() + 86_400_000),
    });

    assert.equal(await countUnlocksForAchievement(database.db, achievement.id), 1);
  });
});

describe("one badge per Place", () => {
  it("refuses a second badge on the same Place", async () => {
    const place = await seedPlace("Single badge place");
    await seedAchievement(place.id, "The badge");

    const code = await expectSqlFailure(() =>
      database.db.insert(database.schema.achievements).values({ placeId: place.id, name: "Another badge" })
    );
    assert.equal(code, UNIQUE_VIOLATION);
  });

  it("refuses a badge on a Place that does not exist", async () => {
    const code = await expectSqlFailure(() =>
      database.db
        .insert(database.schema.achievements)
        .values({ placeId: "00000000-0000-4000-8000-000000000000", name: "Nowhere badge" })
    );
    assert.equal(code, "23503", "a badge must hang off a real Place");
  });
});
