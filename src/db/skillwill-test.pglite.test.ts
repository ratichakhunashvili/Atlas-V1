import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { buildEligiblePlaces } from "@/services/eligibility/rules";
import { hashQrToken } from "@/services/qr/token";
import { createTestDatabase, type TestDatabase } from "./test-support/pglite";
import { listAttractionPlacesForCatalogue, listContractRowsForCatalogue } from "./operations/atlas-contracts";
import { SKILLWILL_TEST_IDS, SKILLWILL_TEST_PLACES, seedSkillwillTest, skillwillPlaceId, type IssuedTestCode } from "./operations/skillwill-test";

/** The Skillwill test base against the real migrations: what it adds, what a Skillwill guest sees, and its QR codes. */

let database: TestDatabase;
let codes: IssuedTestCode[] = [];
before(async () => {
  database = await createTestDatabase();
});
after(async () => {
  await database.close();
});

const idOf = (name: string) => skillwillPlaceId(SKILLWILL_TEST_PLACES.find((place) => place.name === name)!);

describe("Skillwill test base", () => {
  it("adds Skillwill as a hotel, every place, a pending contract per business, and one QR code each", async () => {
    const result = await seedSkillwillTest(database.db);
    codes = result.codes;
    assert.equal(result.hotel, true);
    assert.equal(result.places, SKILLWILL_TEST_PLACES.length);
    assert.equal(result.contracts, SKILLWILL_TEST_PLACES.filter((place) => place.kind === "business").length);
    const contracts = await database.db.select().from(database.schema.atlasPartnerContracts);
    assert.ok(contracts.every((contract) => contract.status === "pending_review"), "no contract is invented as active");
    assert.equal(codes.length, SKILLWILL_TEST_PLACES.length + 1);
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
    assert.equal(visible.length, SKILLWILL_TEST_PLACES.filter((p) => p.kind === "attraction").length);
  });
});
