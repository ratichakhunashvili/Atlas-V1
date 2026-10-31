import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";

const CHECK_VIOLATION = "23514";
const USER_ID = "a71a5000-0000-4000-8000-0000000f0001";
const PLACE_ID = "a71a5000-0000-4000-8000-0000000f1001";

/** Migration 0013 against the real migrations: the columns exist, are optional, and are range-checked in the database itself. */
describe("price level and distance preference columns", () => {
  let harness: TestDatabase;

  before(async () => {
    harness = await createTestDatabase();
    const { db, schema } = harness;
    await db.insert(schema.users).values({ id: USER_ID, email: "prefs@atlas.test", passwordHash: "x", role: "user" });
    await db.insert(schema.places).values({ id: PLACE_ID, name: "[Test] Price place", latitude: 41.7, longitude: 44.8, category: "restaurant" });
  });

  after(async () => {
    await harness.close();
  });

  test("a Place has an UNKNOWN price by default, and 1-3 are accepted", async () => {
    const { db, schema } = harness;
    const [place] = await db.select().from(schema.places);
    assert.equal(place.priceLevel, null);

    for (const level of [1, 2, 3]) {
      await db.execute(
        sql`update places set price_level = ${level}, price_level_source = 'venue menu', price_level_verified_at = now() where id = ${PLACE_ID}`
      );
    }
  });

  test("a price level cannot exist without its source and verification time", async () => {
    const { db } = harness;
    await db.execute(sql`update places set price_level = null, price_level_source = null, price_level_verified_at = null where id = ${PLACE_ID}`);
    for (const [label, statement] of [
      ["no evidence at all", sql`update places set price_level = 2 where id = ${PLACE_ID}`],
      ["source only", sql`update places set price_level = 2, price_level_source = 'menu' where id = ${PLACE_ID}`],
      ["time only", sql`update places set price_level = 2, price_level_verified_at = now() where id = ${PLACE_ID}`],
    ] as const) {
      assert.equal(await expectSqlFailure(() => db.execute(statement)), CHECK_VIOLATION, label);
    }
  });

  test("a price level outside 1-3 is refused by the database", async () => {
    const { db } = harness;
    for (const bad of [0, 4, -1]) {
      assert.equal(
        await expectSqlFailure(() =>
          db.execute(
            sql`update places set price_level = ${bad}, price_level_source = 'menu', price_level_verified_at = now() where id = ${PLACE_ID}`
          )
        ),
        CHECK_VIOLATION,
        String(bad)
      );
    }
  });

  test("a distance preference is optional and cannot exceed the Advisor's 5,000 m cap", async () => {
    const { db, schema } = harness;
    await db.insert(schema.userPreferences).values({ userId: USER_ID, principalId: null, categories: ["restaurant"] });
    const [row] = await db.select().from(schema.userPreferences);
    assert.equal(row.maxDistanceMeters, null);

    await db.execute(sql`update user_preferences set max_distance_meters = 5000 where user_id = ${USER_ID}`);
    for (const bad of [5001, 100, 0, -10]) {
      assert.equal(
        await expectSqlFailure(() =>
          db.execute(sql`update user_preferences set max_distance_meters = ${bad} where user_id = ${USER_ID}`)
        ),
        CHECK_VIOLATION,
        String(bad)
      );
    }
  });
});
