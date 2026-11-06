import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, describe, it } from "node:test";
import { eq, sql } from "drizzle-orm";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";
import { buildEligiblePlaces } from "@/services/eligibility/rules";
import {
  listAttractionPlacesForCatalogue,
  listCatalogueForAdmin,
  listContractRowsForCatalogue,
  loadContractFacts,
  proposeContract,
  setPlaceKind,
  transitionContract,
} from "./operations/atlas-contracts";

/** Migration 0024 against the real migrations: Atlas contracts, Place kinds, their constraints and the approved backfill. */

const CHECK_VIOLATION = "23514";
const UNIQUE_VIOLATION = "23505";

let database: TestDatabase;
let adminId: string;

async function insertPlace(name: string, category: "restaurant" | "landmark" | "hotel" | "spa" | "museum") {
  const [row] = await database.db
    .insert(database.schema.places)
    .values({ name, latitude: 41.7, longitude: 44.8, category })
    .returning();
  return row;
}

before(async () => {
  database = await createTestDatabase();
  const [admin] = await database.db
    .insert(database.schema.users)
    .values({ email: "contracts-admin@example.test", passwordHash: "x", role: "admin" })
    .returning();
  adminId = admin.id;
});

after(async () => {
  await database.close();
});

describe("Atlas partner contract constraints", () => {
  it("starts a new contract as pending_review and refuses a second pending one for the same Place", async () => {
    const place = await insertPlace("Pending Cafe", "restaurant");
    const first = await proposeContract(database.db, place.id);
    assert.equal(first?.status, "pending_review");
    assert.equal(await proposeContract(database.db, place.id), null);
  });

  it("refuses an active contract without an explicit confirmation", async () => {
    const place = await insertPlace("Unconfirmed Bar", "restaurant");
    const code = await expectSqlFailure(() =>
      database.db.insert(database.schema.atlasPartnerContracts).values({ placeId: place.id, status: "active" })
    );
    assert.equal(code, CHECK_VIOLATION);
  });

  it("refuses an ended contract without an end date, and a window that ends before it starts", async () => {
    const place = await insertPlace("Bad Dates Tour", "restaurant");
    assert.equal(
      await expectSqlFailure(() => database.db.insert(database.schema.atlasPartnerContracts).values({ placeId: place.id, status: "ended" })),
      CHECK_VIOLATION
    );
    assert.equal(
      await expectSqlFailure(() =>
        database.db.insert(database.schema.atlasPartnerContracts).values({
          placeId: place.id,
          startsAt: new Date("2026-12-01T00:00:00Z"),
          endsAt: new Date("2026-11-01T00:00:00Z"),
        })
      ),
      CHECK_VIOLATION
    );
  });

  it("allows only one active contract per Place, and the transition reports a clash instead of crashing", async () => {
    const place = await insertPlace("Double Active Shop", "restaurant");
    const now = new Date();
    await database.db
      .insert(database.schema.atlasPartnerContracts)
      .values({ placeId: place.id, status: "active", confirmedAt: now, confirmedBy: adminId });
    const second = await proposeContract(database.db, place.id);
    assert.ok(second);
    const clashed = await transitionContract(database.db, second.id, ["pending_review"], { status: "active", confirmedAt: now, confirmedBy: adminId });
    assert.equal(clashed, null);
    assert.equal(
      await expectSqlFailure(() =>
        database.db.insert(database.schema.atlasPartnerContracts).values({ placeId: place.id, status: "active", confirmedAt: now })
      ),
      UNIQUE_VIOLATION
    );
  });

  it("compare-and-set: a transition from the wrong status changes nothing", async () => {
    const place = await insertPlace("Stale Click Cafe", "restaurant");
    const proposed = await proposeContract(database.db, place.id);
    assert.ok(proposed);
    assert.equal(await transitionContract(database.db, proposed.id, ["active"], { status: "suspended" }), null);
    const ended = await transitionContract(database.db, proposed.id, ["pending_review"], { status: "ended", endedAt: new Date() });
    assert.equal(ended?.status, "ended");
  });

  it("keeps contract history: a Place with a contract cannot be hard-deleted", async () => {
    const place = await insertPlace("History Bakery", "restaurant");
    await proposeContract(database.db, place.id);
    const code = await expectSqlFailure(() => database.db.delete(database.schema.places).where(eq(database.schema.places.id, place.id)));
    // ON DELETE RESTRICT reports restrict_violation (23001); a plain FK error would be 23503.
    assert.ok(["23001", "23503"].includes(code), code);
  });
});

describe("Place kinds", () => {
  it("defaults to an unconfirmed business, and rejects an unknown kind", async () => {
    const place = await insertPlace("Default Kind", "restaurant");
    assert.equal(place.kind, "business");
    assert.equal(place.kindConfirmedAt, null);
    const code = await expectSqlFailure(() =>
      database.db.execute(sql`update places set kind = 'museum' where id = ${place.id}`)
    );
    assert.equal(code, CHECK_VIOLATION);
  });

  it("records an admin's kind choice as confirmed", async () => {
    const place = await insertPlace("Old Fortress", "landmark");
    const updated = await setPlaceKind(database.db, place.id, "attraction", new Date("2026-11-03T10:00:00Z"));
    assert.equal(updated?.kind, "attraction");
    assert.deepEqual(updated?.kindConfirmedAt, new Date("2026-11-03T10:00:00Z"));
  });

  it("loads the facts the workflow rules need: anchor, facility, open and live contracts", async () => {
    const hotelPlace = await insertPlace("Facts Hotel", "hotel");
    const [hotel] = await database.db.insert(database.schema.hotels).values({ placeId: hotelPlace.id }).returning();
    const spa = await insertPlace("Facts Spa", "spa");
    await database.db.insert(database.schema.hotelFacilities).values({ hotelId: hotel.id, placeId: spa.id, facilityType: "spa", status: "active" });
    const cafe = await insertPlace("Facts Cafe", "restaurant");
    const contract = await proposeContract(database.db, cafe.id);
    assert.ok(contract);

    assert.equal((await loadContractFacts(database.db, hotelPlace.id)).isHotelAnchor, true);
    assert.equal((await loadContractFacts(database.db, spa.id)).isHotelFacility, true);
    const cafeFacts = await loadContractFacts(database.db, cafe.id);
    assert.equal(cafeFacts.hasOpenContract, true);
    assert.equal(cafeFacts.hasLiveContract, true);

    await transitionContract(database.db, contract.id, ["pending_review"], { status: "ended", endedAt: new Date() });
    const endedFacts = await loadContractFacts(database.db, cafe.id);
    assert.equal(endedFacts.hasOpenContract, false);
    assert.equal(endedFacts.hasLiveContract, false);
  });

  it("lists businesses and attractions with their contracts for admins, and leaves hotels out", async () => {
    const rows = await listCatalogueForAdmin(database.db);
    assert.ok(rows.every((row) => row.place.kind !== "hotel"));
    const pending = rows.find((row) => row.place.name === "Pending Cafe");
    assert.equal(pending?.contracts.length, 1);
  });
});

describe("migration 0024 backfill (decisions 1 and 3)", () => {
  /** The backfill statements exactly as checked in, run against rows shaped like today's data. */
  const backfill = readFileSync("src/db/migrations/0024_catalogue_contracts_and_kind.sql", "utf8")
    .split("--> statement-breakpoint")
    .filter((_, index, all) => index >= all.findIndex((statement) => statement.includes("-- Backfill")))
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  it("marks anchors as confirmed hotels, suggests attractions, and gives today's partners pending contracts only", async () => {
    const backfillDb = await createTestDatabase();
    try {
      const { db, schema } = backfillDb;
      const insert = async (name: string, category: "hotel" | "restaurant" | "landmark" | "spa") => {
        const [row] = await db.insert(schema.places).values({ name, latitude: 41.7, longitude: 44.8, category }).returning();
        return row;
      };
      const hotelPlace = await insert("Backfill Hotel", "hotel");
      const [hotel] = await db.insert(schema.hotels).values({ placeId: hotelPlace.id }).returning();
      const partnerCafe = await insert("Backfill Partner Cafe", "restaurant");
      await db.insert(schema.hotelPartnerships).values({ hotelId: hotel.id, placeId: partnerCafe.id, status: "active", confirmedAt: new Date() });
      const partneredLandmark = await insert("Backfill Partnered Landmark", "landmark");
      await db.insert(schema.hotelPartnerships).values({ hotelId: hotel.id, placeId: partneredLandmark.id, status: "pending_review" });
      const plainLandmark = await insert("Backfill Plain Landmark", "landmark");
      const facilitySpa = await insert("Backfill Facility Spa", "spa");
      await db.insert(schema.hotelFacilities).values({ hotelId: hotel.id, placeId: facilitySpa.id, facilityType: "spa", status: "active" });
      const loneCafe = await insert("Backfill Lone Cafe", "restaurant");

      for (const statement of backfill) await db.execute(sql.raw(statement));

      const kindOf = async (id: string) => (await db.select().from(schema.places).where(eq(schema.places.id, id)))[0];
      const hotelRow = await kindOf(hotelPlace.id);
      assert.equal(hotelRow.kind, "hotel");
      assert.notEqual(hotelRow.kindConfirmedAt, null);
      const landmark = await kindOf(plainLandmark.id);
      assert.equal(landmark.kind, "attraction");
      assert.equal(landmark.kindConfirmedAt, null, "an attraction from the category is only a suggestion");
      assert.equal((await kindOf(partneredLandmark.id)).kind, "business", "commercial history keeps it a business");
      assert.equal((await kindOf(loneCafe.id)).kind, "business");

      const contracts = await db.select().from(schema.atlasPartnerContracts);
      const byPlace = new Map(contracts.map((contract) => [contract.placeId, contract]));
      assert.equal(byPlace.get(partnerCafe.id)?.status, "pending_review", "even an ACTIVE hotel partner starts pending");
      assert.equal(byPlace.get(partneredLandmark.id)?.status, "pending_review");
      assert.equal(byPlace.has(facilitySpa.id), false, "facilities never get contracts");
      assert.equal(byPlace.has(loneCafe.id), false, "no partnership, no contract");
      assert.equal(byPlace.has(hotelPlace.id), false);
      assert.ok(contracts.every((contract) => contract.status === "pending_review"), "the backfill makes nothing active");
    } finally {
      await backfillDb.close();
    }
  });
});

describe("guest catalogue reads (phase C2), end to end through the real SQL and the real rule", () => {
  it("shows contracted businesses and attractions to every hotel, each hotel only its own facilities, and nothing else", async () => {
    const catalogueDb = await createTestDatabase();
    try {
      const { db, schema } = catalogueDb;
      const now = new Date("2026-11-06T12:00:00Z");
      const insert = async (name: string, category: "hotel" | "restaurant" | "landmark" | "spa", kind: "business" | "attraction" | "hotel" = "business") => {
        const [row] = await db
          .insert(schema.places)
          .values({ name, latitude: 41.7, longitude: 44.8, category, kind, publicationStatus: "published", publishedAt: now, verificationStatus: "verified", verifiedAt: now })
          .returning();
        return row;
      };
      const hotelAPlace = await insert("A Hotel", "hotel", "hotel");
      const hotelBPlace = await insert("B Hotel", "hotel", "hotel");
      const [hotelA] = await db.insert(schema.hotels).values({ placeId: hotelAPlace.id }).returning();
      const [hotelB] = await db.insert(schema.hotels).values({ placeId: hotelBPlace.id }).returning();
      const contracted = await insert("Contracted Cafe", "restaurant");
      const pending = await insert("Pending Cafe", "restaurant");
      const partnershipOnly = await insert("Partnership Only Cafe", "restaurant");
      await insert("Fortress", "landmark", "attraction");
      const bGarden = await insert("B Garden", "landmark", "attraction"); // Hotel B's facility, marked as an attraction
      const aSpa = await insert("A Spa", "spa");
      await db.insert(schema.hotelFacilities).values([
        { hotelId: hotelA.id, placeId: aSpa.id, facilityType: "spa", status: "active" },
        { hotelId: hotelB.id, placeId: bGarden.id, facilityType: "other", status: "active" },
      ]);
      await db.insert(schema.atlasPartnerContracts).values([
        { placeId: contracted.id, status: "active", confirmedAt: now },
        { placeId: pending.id, status: "pending_review" },
      ]);
      await db.insert(schema.hotelPartnerships).values([
        { hotelId: hotelA.id, placeId: contracted.id, status: "active", confirmedAt: now, featured: true },
        { hotelId: hotelA.id, placeId: partnershipOnly.id, status: "active", confirmedAt: now },
      ]);

      const catalogueFor = async (hotelId: string, hotelPlaceId: string) => {
        const [contracts, attractions] = await Promise.all([listContractRowsForCatalogue(db, hotelId), listAttractionPlacesForCatalogue(db, hotelId)]);
        const facilities = (
          await db.select({ facility: schema.hotelFacilities, place: schema.places }).from(schema.hotelFacilities)
            .innerJoin(schema.places, eq(schema.places.id, schema.hotelFacilities.placeId))
            .where(eq(schema.hotelFacilities.hotelId, hotelId))
        ).map(({ facility, place }) => ({ ...facility, place }));
        const partnerships = (
          await db.select({ partnership: schema.hotelPartnerships, place: schema.places }).from(schema.hotelPartnerships)
            .innerJoin(schema.places, eq(schema.places.id, schema.hotelPartnerships.placeId))
            .where(eq(schema.hotelPartnerships.hotelId, hotelId))
        ).map(({ partnership, place }) => ({ ...partnership, place }));
        const result = buildEligiblePlaces({ hotelId, hotelPlaceId, facilities, contracts, attractions, partnerships, now });
        return new Map(result.map((entry) => [entry.place.name, entry]));
      };

      const forA = await catalogueFor(hotelA.id, hotelAPlace.id);
      const forB = await catalogueFor(hotelB.id, hotelBPlace.id);
      assert.deepEqual([...forA.keys()].sort(), ["A Spa", "Contracted Cafe", "Fortress"]);
      assert.deepEqual([...forB.keys()].sort(), ["B Garden", "Contracted Cafe", "Fortress"]);
      assert.equal(forB.get("B Garden")?.source, "facility", "Hotel B's own garden is its facility");
      assert.notEqual(forA.get("Contracted Cafe")?.promotion, null, "promoted by Hotel A");
      assert.equal(forB.get("Contracted Cafe")?.promotion, null, "not by Hotel B");
    } finally {
      await catalogueDb.close();
    }
  });
});
