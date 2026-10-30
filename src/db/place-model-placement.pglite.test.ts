import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";
import { saveModelPlacement, type ModelPlacementInput } from "./operations/place-model-settings";

/**
 * Migration 0017 against the real migrations: a model's display anchor is stored separately from its Place, is
 * validated by the database itself, and saving it cannot alter the Place or anything that derives from the Place.
 */

const CHECK_VIOLATION = "23514";
let database: TestDatabase;
let modelId: string;
let placeId: string;
let hotelId: string;

const placement = (overrides: Partial<ModelPlacementInput> = {}): ModelPlacementInput => ({
  status: "draft",
  targetHeightMeters: 20,
  rotationDegrees: 0,
  pitchDegrees: 0,
  rollDegrees: 0,
  elevationOffsetMeters: 0,
  scale: 1,
  scaleX: 1,
  scaleY: 1,
  scaleZ: 1,
  anchorLatitude: null,
  anchorLongitude: null,
  ...overrides,
});

before(async () => {
  database = await createTestDatabase();
  const { db, schema } = database;

  const [hotelPlace] = await db.insert(schema.places).values({ name: "[Test] Anchor Hotel", latitude: 41.7, longitude: 44.8, category: "hotel" }).returning();
  const [place] = await db
    .insert(schema.places)
    .values({
      name: "[Test] Anchor Landmark",
      latitude: 41.715,
      longitude: 44.827,
      category: "landmark",
      publicationStatus: "published",
      publishedAt: new Date(),
      verificationStatus: "verified",
      verifiedAt: new Date(),
    })
    .returning();
  placeId = place.id;
  const [hotel] = await db.insert(schema.hotels).values({ placeId: hotelPlace.id }).returning();
  hotelId = hotel.id;
  await db
    .insert(schema.hotelPartnerships)
    .values({ hotelId, placeId, status: "active", confirmedAt: new Date() });

  const [model] = await db
    .insert(schema.placeModels)
    .values({ placeId, storageKey: "k", fileUrl: "https://example.test/m.glb", fileSizeBytes: 10, contentType: "model/gltf-binary" })
    .returning();
  modelId = model.id;
});

after(async () => {
  await database.close();
});

describe("a model's display anchor", () => {
  it("defaults to none: existing models stay at their Place, with neutral pitch, roll and per-axis scale", async () => {
    const [model] = await database.db.select().from(database.schema.placeModels).where(eq(database.schema.placeModels.id, modelId));
    assert.deepEqual(
      [model.anchorLatitude, model.anchorLongitude, model.pitchDegrees, model.rollDegrees, model.scaleX, model.scaleY, model.scaleZ],
      [null, null, 0, 0, 1, 1, 1]
    );
  });

  it("saves an anchor and the full transform without touching the Place, its partnership or its eligibility", async () => {
    const { db, schema } = database;
    const placeBefore = (await db.select().from(schema.places).where(eq(schema.places.id, placeId)))[0];
    const partnershipBefore = (await db.select().from(schema.hotelPartnerships).where(eq(schema.hotelPartnerships.placeId, placeId)))[0];

    const saved = await saveModelPlacement(
      db,
      modelId,
      placement({ status: "enabled", anchorLatitude: 41.7152, anchorLongitude: 44.8275, pitchDegrees: 12, rollDegrees: -4, scaleX: 1.5, rotationDegrees: 90, elevationOffsetMeters: 3 })
    );
    assert.equal(saved?.anchorLatitude, 41.7152);
    assert.equal(saved?.anchorLongitude, 44.8275);
    assert.equal(saved?.status, "enabled");

    const placeAfter = (await db.select().from(schema.places).where(eq(schema.places.id, placeId)))[0];
    const partnershipAfter = (await db.select().from(schema.hotelPartnerships).where(eq(schema.hotelPartnerships.placeId, placeId)))[0];
    assert.deepEqual(placeAfter, placeBefore, "the canonical Place row is byte-for-byte unchanged");
    assert.deepEqual(partnershipAfter, partnershipBefore, "so is the partnership that makes it eligible");
    assert.equal(placeAfter.latitude, 41.715, "check-in, navigation and the route destination still read these");
  });

  it("clears back to the Place with both coordinates null", async () => {
    const saved = await saveModelPlacement(database.db, modelId, placement({ anchorLatitude: null, anchorLongitude: null }));
    assert.deepEqual([saved?.anchorLatitude, saved?.anchorLongitude], [null, null]);
  });

  it("refuses a half-set anchor, an anchor outside Georgia and out-of-range transforms in the database itself", async () => {
    const { db } = database;
    const bad: Array<[string, Partial<ModelPlacementInput>]> = [
      ["latitude only", { anchorLatitude: 41.7, anchorLongitude: null }],
      ["longitude only", { anchorLatitude: null, anchorLongitude: 44.8 }],
      ["Paris", { anchorLatitude: 48.85, anchorLongitude: 2.35 }],
      ["pitch", { pitchDegrees: 200 }],
      ["roll", { rollDegrees: -181 }],
      ["axis scale zero", { scaleX: 0 }],
      ["axis scale huge", { scaleZ: 101 }],
    ];
    for (const [label, overrides] of bad) {
      assert.equal(await expectSqlFailure(() => saveModelPlacement(db, modelId, placement(overrides))), CHECK_VIOLATION, label);
    }
  });

  it("returns null for a model that does not exist rather than creating one", async () => {
    assert.equal(await saveModelPlacement(database.db, "00000000-0000-4000-8000-000000000000", placement()), null);
  });
});
