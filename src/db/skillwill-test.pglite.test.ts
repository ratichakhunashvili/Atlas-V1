import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { buildEligiblePlaces } from "@/services/eligibility/rules";
import { hashQrToken } from "@/services/qr/token";
import { createTestDatabase, type TestDatabase } from "./test-support/pglite";
import { listAttractionPlacesForCatalogue, listContractRowsForCatalogue } from "./operations/atlas-contracts";
import {
  SKILLWILL_AREA_PLACES,
  SKILLWILL_TEST_IDS,
  SKILLWILL_TEST_PLACES,
  areaPlaceId,
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
    assert.equal(result.places, ALL.length);
    assert.equal(result.contracts, ALL.filter((place) => place.kind === "business").length);
    const contracts = await database.db.select().from(database.schema.atlasPartnerContracts);
    assert.ok(contracts.every((contract) => contract.status === "pending_review"), "no contract is invented as active");
    assert.equal(codes.length, ALL.length + 1);
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
    assert.deepEqual(await seedSkillwillTest(database.db), { hotel: false, places: 0, contracts: 0, codes: [] });
  });

  it("shows a Skillwill guest the attractions at once, the cafés only after their contracts are confirmed, never Skillwill itself", async () => {
    const hotelId = SKILLWILL_TEST_IDS.hotel;
    const [contracts, attractions] = await Promise.all([
      listContractRowsForCatalogue(database.db, hotelId),
      listAttractionPlacesForCatalogue(database.db, hotelId),
    ]);
    const visible = buildEligiblePlaces({ hotelId, hotelPlaceId: SKILLWILL_TEST_IDS.place, facilities: [], partnerships: [], contracts, attractions, now: new Date() }).map(
      (entry) => entry.place.id
    );
    assert.ok(visible.includes(idOf("Avlabari Underground Printing House Museum")));
    assert.ok(visible.includes(idOf("Tbilisi Wedding Palace")));
    assert.ok(!visible.includes(idOf("Coffee & Flowers")), "a business waits for a confirmed contract");
    assert.ok(!visible.includes(SKILLWILL_TEST_IDS.place), "the base is never a destination");
    assert.equal(visible.length, ALL.filter((p) => p.kind === "attraction").length);
  });
});
