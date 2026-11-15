import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { after, before, describe, it } from "node:test";
import { buildEligiblePlaces, type FacilityRow } from "@/services/eligibility/rules";
import { hashQrToken } from "@/services/qr/token";
import { createTestDatabase, type TestDatabase } from "./test-support/pglite";
import { listAttractionPlacesForCatalogue, listContractRowsForCatalogue } from "./operations/atlas-contracts";
import {
  SKILLWILL_AREA_PLACES,
  SKILLWILL_TEST_FACILITIES,
  SKILLWILL_TEST_IDS,
  SKILLWILL_TEST_PLACES,
  areaPlaceId,
  skillwillFacilityId,
  seedSkillwillTest,
  skillwillPlaceId,
  type IssuedTestCode,
} from "./operations/skillwill-test";

/** The Skillwill test base against the real migrations: what it adds, what a Skillwill guest sees, and its QR codes. */

let database: TestDatabase;
let codes: IssuedTestCode[] = [];
before(async () => {
  database = await createTestDatabase();
});
after(async () => {
  await database.close();
});

const ALL = [...SKILLWILL_TEST_PLACES, ...SKILLWILL_AREA_PLACES];
const facilityPlaceId = (name: string) => skillwillPlaceId(SKILLWILL_TEST_FACILITIES.find((facility) => facility.name === name)!);

/** A hotel's facility rows with their Places, the way the guest catalogue loads them. */
async function facilitiesOf(hotelId: string): Promise<FacilityRow[]> {
  const { hotelFacilities, places } = database.schema;
  return database.db
    .select({
      id: hotelFacilities.id,
      hotelId: hotelFacilities.hotelId,
      placeId: hotelFacilities.placeId,
      status: hotelFacilities.status,
      facilityType: hotelFacilities.facilityType,
      place: places,
    })
    .from(hotelFacilities)
    .innerJoin(places, eq(hotelFacilities.placeId, places.id))
    .where(eq(hotelFacilities.hotelId, hotelId));
}

const idOf = (name: string) => skillwillPlaceId(SKILLWILL_TEST_PLACES.find((place) => place.name === name)!);

describe("Skillwill area data (OpenStreetMap, 3 km)", () => {
  it("has hundreds of places, each with a unique stable id, a valid kind, a name and coordinates within 3 km", () => {
    assert.ok(SKILLWILL_AREA_PLACES.length > 500, String(SKILLWILL_AREA_PLACES.length));
    const ids = SKILLWILL_AREA_PLACES.map(areaPlaceId);
    assert.equal(new Set(ids).size, ids.length, "ids are unique");
    assert.ok(ids.every((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)), "every id is a valid UUID");
    for (const place of SKILLWILL_AREA_PLACES) {
      assert.ok(place.name.trim().length > 0 && ["attraction", "business"].includes(place.kind), place.osm);
      assert.ok(Math.abs(place.latitude - 41.6865) < 0.03 && Math.abs(place.longitude - 44.8309) < 0.04, place.osm);
      if (place.imageUrl) {
        assert.match(place.imageUrl, /^https:\/\/(upload|thumb)\.wikimedia\.org\/[^?#]+$/, "photos only from Wikimedia Commons, with no tracking query");
        assert.match(place.description, /Photo: .+ via Wikimedia Commons\./, "every photo is credited");
      }
    }
  });
});

describe("Skillwill test base", () => {
  it("adds Skillwill as a hotel, every place, a pending contract per business, and one QR code each", async () => {
    const result = await seedSkillwillTest(database.db);
    codes = result.codes;
    assert.equal(result.hotel, true);
    assert.equal(result.places, ALL.length + SKILLWILL_TEST_FACILITIES.length);
    assert.equal(result.facilities, SKILLWILL_TEST_FACILITIES.length);
    assert.equal(result.contracts, ALL.filter((place) => place.kind === "business").length);
    const contracts = await database.db.select().from(database.schema.atlasPartnerContracts);
    assert.ok(contracts.every((contract) => contract.status === "pending_review"), "no contract is invented as active");
    assert.equal(codes.length, ALL.length + SKILLWILL_TEST_FACILITIES.length + 1);
    for (const facility of SKILLWILL_TEST_FACILITIES) assert.ok(codes.some((code) => code.kind === "place" && code.label === facility.name), facility.name);
    assert.equal(codes.filter((code) => code.kind === "hotel").length, 1);
    assert.equal(new Set(codes.map((code) => code.rawToken)).size, codes.length, "every code is different");
  });

  it("stores only hashes, each bound to its purpose and subject", async () => {
    const rows = await database.db.select().from(database.schema.qrCredentials);
    const text = JSON.stringify(rows);
    for (const code of codes) {
      assert.ok(!text.includes(code.rawToken), "the raw code is never stored");
      const row = rows.find((r) => r.tokenHash === hashQrToken(code.rawToken));
      assert.ok(row, code.label);
      if (code.kind === "hotel") assert.deepEqual([row.purpose, row.hotelId, row.placeId], ["hotel_entry", SKILLWILL_TEST_IDS.hotel, null]);
      else assert.equal(row.purpose, "place_check_in");
    }
  });

  it("is safe to run twice: nothing new, and no code is replaced", async () => {
    assert.deepEqual(await seedSkillwillTest(database.db), { hotel: false, places: 0, contracts: 0, facilities: 0, codes: [] });
  });

  it("shows a Skillwill guest the attractions at once, the cafés only after their contracts are confirmed, never Skillwill itself", async () => {
    const hotelId = SKILLWILL_TEST_IDS.hotel;
    const [contracts, attractions] = await Promise.all([
      listContractRowsForCatalogue(database.db, hotelId),
      listAttractionPlacesForCatalogue(database.db, hotelId),
    ]);
    const visible = buildEligiblePlaces({ hotelId, hotelPlaceId: SKILLWILL_TEST_IDS.place, facilities: await facilitiesOf(hotelId), partnerships: [], contracts, attractions, now: new Date() }).map(
      (entry) => entry.place.id
    );
    assert.ok(visible.includes(idOf("Avlabari Underground Printing House Museum")));
    assert.ok(visible.includes(idOf("Tbilisi Wedding Palace")));
    assert.ok(!visible.includes(idOf("Coffee & Flowers")), "a business waits for a confirmed contract");
    assert.ok(!visible.includes(SKILLWILL_TEST_IDS.place), "the base is never a destination");
    assert.equal(visible.length, ALL.filter((p) => p.kind === "attraction").length + SKILLWILL_TEST_FACILITIES.length);
    for (const facility of SKILLWILL_TEST_FACILITIES) assert.ok(visible.includes(facilityPlaceId(facility.name)), `${facility.name} is shown to Skillwill guests`);
  });

  it("adds Kombinati and the PlayStation Room as Skillwill's own active facilities, published, verified, QR check-in only, with no contract", async () => {
    const { places, hotelFacilities, atlasPartnerContracts } = database.schema;
    for (const facility of SKILLWILL_TEST_FACILITIES) {
      const placeId = facilityPlaceId(facility.name);
      const [place] = await database.db.select().from(places).where(eq(places.id, placeId));
      assert.equal(place.checkInMethod, "qr");
      assert.equal(place.kind, "business");
      assert.equal(place.category, "activity");
      assert.deepEqual([place.publicationStatus, place.verificationStatus, place.archivedAt], ["published", "verified", null]);
      assert.deepEqual([place.latitude, place.longitude], [41.686473, 44.830894]);
      const [row] = await database.db.select().from(hotelFacilities).where(eq(hotelFacilities.placeId, placeId));
      assert.deepEqual([row.id, row.hotelId, row.status], [skillwillFacilityId(facility), SKILLWILL_TEST_IDS.hotel, "active"]);
      assert.equal((await database.db.select().from(atlasPartnerContracts).where(eq(atlasPartnerContracts.placeId, placeId))).length, 0);
    }
  });

  it("never shows the campus facilities to another hotel's guests", async () => {
    const { places, hotels } = database.schema;
    const otherPlaceId = "5c111000-0000-4000-8000-000000000399";
    await database.db.insert(places).values({ id: otherPlaceId, name: "Other Hotel", latitude: 41.69, longitude: 44.8, category: "hotel", kind: "hotel" });
    const [other] = await database.db.insert(hotels).values({ placeId: otherPlaceId }).returning();
    const [contracts, attractions] = await Promise.all([
      listContractRowsForCatalogue(database.db, other.id),
      listAttractionPlacesForCatalogue(database.db, other.id),
    ]);
    const visible = buildEligiblePlaces({ hotelId: other.id, hotelPlaceId: otherPlaceId, facilities: await facilitiesOf(other.id), partnerships: [], contracts, attractions, now: new Date() }).map(
      (entry) => entry.place.id
    );
    assert.ok(visible.length > 0, "the other hotel still sees the attractions");
    for (const facility of SKILLWILL_TEST_FACILITIES) assert.ok(!visible.includes(facilityPlaceId(facility.name)), facility.name);
  });
});

describe("Hotel 'Tasks per day' (migration 0040)", () => {
  it("defaults to 4 and the database refuses anything outside 1-4", async () => {
    const { hotels } = database.schema;
    const [hotel] = await database.db.select().from(hotels).where(eq(hotels.id, SKILLWILL_TEST_IDS.hotel));
    assert.equal(hotel.dailyTaskLimit, 4);
    for (const ok of [1, 2, 3, 4]) {
      await database.db.update(hotels).set({ dailyTaskLimit: ok }).where(eq(hotels.id, SKILLWILL_TEST_IDS.hotel));
    }
    for (const bad of [0, 5, -1]) {
      await assert.rejects(
        database.db.update(hotels).set({ dailyTaskLimit: bad }).where(eq(hotels.id, SKILLWILL_TEST_IDS.hotel)),
        (error: unknown) => JSON.stringify(error, Object.getOwnPropertyNames(error)).includes("hotels_daily_task_limit_check"),
        String(bad)
      );
    }
    await database.db.update(hotels).set({ dailyTaskLimit: 4 }).where(eq(hotels.id, SKILLWILL_TEST_IDS.hotel));
  });
});
