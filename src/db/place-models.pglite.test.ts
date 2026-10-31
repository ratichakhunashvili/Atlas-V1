import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";
import { recordVerifiedVisit } from "./operations/place-visits";
import { buildGuestModels } from "@/services/map3d";

/**
 * Migration 0011 and the lock rule, against an in-memory Postgres built from the
 * checked-in migrations.
 *
 * PGlite serialises statements — constraints and semantics only, never parallel
 * behaviour. The 3D rendering itself is browser code and is NOT exercised here.
 */

const UNIQUE_VIOLATION = "23505";
const CHECK_VIOLATION = "23514";
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
async function seedPlace(name: string) {
  const [place] = await database.db
    .insert(database.schema.places)
    .values({ name, latitude: 41.7151, longitude: 44.8271, category: "landmark" })
    .returning();
  return place;
}

async function seedUser() {
  counter += 1;
  const [user] = await database.db
    .insert(database.schema.users)
    .values({ email: `model-viewer-${counter}@example.test`, passwordHash: "x" })
    .returning();
  return user;
}

async function seedModel(placeId: string, overrides: Record<string, unknown> = {}) {
  const [model] = await database.db
    .insert(database.schema.placeModels)
    .values({
      placeId,
      storageKey: `place-models/${placeId}.glb`,
      fileUrl: `https://cdn.example.invalid/${placeId}.glb`,
      fileSizeBytes: 2048,
      contentType: "model/gltf-binary",
      ...overrides,
    })
    .returning();
  return model;
}

describe("migration 0011", () => {
  it("creates place_models", async () => {
    const result = await database.db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' and table_name = 'place_models'`
    );
    assert.equal(result.rows.length, 1);
  });

  it("stores no coordinates of its own — position comes from the Place", async () => {
    const result = await database.db.execute(
      sql`select column_name from information_schema.columns where table_name = 'place_models'`
    );
    const columns = (result.rows as Array<{ column_name: string }>).map((row) => row.column_name);

    assert.equal(columns.includes("latitude"), false, "a corrected Place must move its model with it");
    assert.equal(columns.includes("longitude"), false);
  });

  it("starts a model as a draft, invisible to guests", async () => {
    const place = await seedPlace("Draft model place");
    const model = await seedModel(place.id);

    assert.equal(model.status, "draft");
  });
});

describe("one model per Place", () => {
  it("refuses a second model on the same Place", async () => {
    const place = await seedPlace("Single model place");
    await seedModel(place.id);

    const code = await expectSqlFailure(() => seedModel(place.id));
    assert.equal(code, UNIQUE_VIOLATION);
  });

  it("refuses a model on a Place that does not exist", async () => {
    const code = await expectSqlFailure(() => seedModel("00000000-0000-4000-8000-000000000000"));
    assert.equal(code, "23503");
  });

  it("stops a Place with a model from being deleted", async () => {
    const place = await seedPlace("Protected by a model");
    await seedModel(place.id);

    const code = await expectSqlFailure(() =>
      database.db.delete(database.schema.places).where(eq(database.schema.places.id, place.id))
    );
    assert.equal(code, RESTRICT_VIOLATION, "archive the Place instead");
  });
});

describe("placement values the renderer can actually use", () => {
  it("refuses a height of zero or less, or an absurd one", async () => {
    const place = await seedPlace("Bad height place");

    for (const height of [0, -5, 1001]) {
      const code = await expectSqlFailure(() => seedModel(place.id, { targetHeightMeters: height }));
      assert.equal(code, CHECK_VIOLATION, `height ${height} must be refused`);
    }
  });

  it("refuses a non-positive or absurd scale", async () => {
    const place = await seedPlace("Bad scale place");

    for (const scale of [0, -1, 101]) {
      const code = await expectSqlFailure(() => seedModel(place.id, { scale }));
      assert.equal(code, CHECK_VIOLATION);
    }
  });

  it("refuses a rotation outside a full turn either way", async () => {
    const place = await seedPlace("Bad rotation place");
    const code = await expectSqlFailure(() => seedModel(place.id, { rotationDegrees: 361 }));
    assert.equal(code, CHECK_VIOLATION);
  });

  it("refuses an empty file", async () => {
    const place = await seedPlace("Empty file place");
    const code = await expectSqlFailure(() => seedModel(place.id, { fileSizeBytes: 0 }));
    assert.equal(code, CHECK_VIOLATION);
  });

  it("refuses a status outside the allowed set", async () => {
    const place = await seedPlace("Bad status place");
    const code = await expectSqlFailure(() =>
      database.db.execute(sql`
        insert into place_models (place_id, storage_key, file_url, file_size_bytes, content_type, status)
        values (${place.id}, 'k', 'u', 10, 'model/gltf-binary', 'published')
      `)
    );
    assert.equal(code, CHECK_VIOLATION);
  });
});

describe("lock state, from real visits in the database", () => {
  it("unlocks only for the guest who actually visited", async () => {
    const place = await seedPlace("Visited model place");
    const model = await seedModel(place.id, { status: "enabled" });

    const visitor = await seedUser();
    const stranger = await seedUser();

    await recordVerifiedVisit(database.db, {
      userId: visitor.id,
      placeId: place.id,
      method: "gps",
      now: NOW,
    });

    // The visits each guest actually has, read from the database.
    const visitorVisits = await database.db
      .select()
      .from(database.schema.placeVisits)
      .where(eq(database.schema.placeVisits.userId, visitor.id));
    const strangerVisits = await database.db
      .select()
      .from(database.schema.placeVisits)
      .where(eq(database.schema.placeVisits.userId, stranger.id));

    const sources = [{ model, place: { id: place.id, latitude: place.latitude, longitude: place.longitude } }];
    const eligible = new Set([place.id]);

    const [forVisitor] = buildGuestModels({
      sources,
      eligiblePlaceIds: eligible,
      visitedPlaceIds: new Set(visitorVisits.map((visit) => visit.placeId)),
    });
    const [forStranger] = buildGuestModels({
      sources,
      eligiblePlaceIds: eligible,
      visitedPlaceIds: new Set(strangerVisits.map((visit) => visit.placeId)),
    });

    assert.equal(forVisitor.unlocked, true);
    assert.equal(forStranger.unlocked, false, "one guest's visit never unlocks another guest's model");
  });

  it("keeps a model unlocked after the itinerary that produced the visit is gone", async () => {
    const place = await seedPlace("Durable unlock place");
    const model = await seedModel(place.id, { status: "enabled" });
    const guest = await seedUser();

    await recordVerifiedVisit(database.db, { userId: guest.id, placeId: place.id, method: "qr", now: NOW });

    const visits = await database.db
      .select()
      .from(database.schema.placeVisits)
      .where(eq(database.schema.placeVisits.userId, guest.id));

    const [result] = buildGuestModels({
      sources: [{ model, place: { id: place.id, latitude: place.latitude, longitude: place.longitude } }],
      eligiblePlaceIds: new Set([place.id]),
      visitedPlaceIds: new Set(visits.map((visit) => visit.placeId)),
    });

    assert.equal(result.unlocked, true, "the unlock follows the permanent visit, not a plan");
  });
});
