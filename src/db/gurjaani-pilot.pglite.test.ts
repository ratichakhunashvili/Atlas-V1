import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { buildEligiblePlaces } from "@/services/eligibility/rules";
import { createTestDatabase, type TestDatabase } from "./test-support/pglite";
import { listAttractionPlacesForCatalogue, listContractRowsForCatalogue } from "./operations/atlas-contracts";
import { GURJAANI_PILOT_IDS, GURJAANI_PILOT_PLACES, pilotPlaceId, seedGurjaaniPilot } from "./operations/gurjaani-pilot";

/** The Gurjaani pilot data against the real migrations: what it inserts, and what a guest of Techpark can see. */

let database: TestDatabase;
before(async () => {
  database = await createTestDatabase();
});
after(async () => {
  await database.close();
});

const idOf = (name: string) => pilotPlaceId(GURJAANI_PILOT_PLACES.find((place) => place.name === name)!);

describe("Gurjaani pilot data", () => {
  it("adds Techpark as a hotel, every place, and a pending contract per business", async () => {
    const result = await seedGurjaaniPilot(database.db);
    assert.equal(result.hotel, true);
    assert.equal(result.places, GURJAANI_PILOT_PLACES.length + 1);
    assert.equal(result.contracts, GURJAANI_PILOT_PLACES.filter((place) => place.kind === "business").length);
    const contracts = await database.db.select().from(database.schema.atlasPartnerContracts);
    assert.ok(contracts.every((contract) => contract.status === "pending_review"), "no contract is invented as active");
  });

  it("is safe to run twice: nothing new is added", async () => {
    assert.deepEqual(await seedGurjaaniPilot(database.db), { places: 0, contracts: 0, hotel: false });
  });

  it("shows a Techpark guest the confirmed attractions only: no pending business, no unconfirmed draft, not Techpark itself", async () => {
    const hotelId = GURJAANI_PILOT_IDS.techparkHotel;
    const [contracts, attractions] = await Promise.all([
      listContractRowsForCatalogue(database.db, hotelId),
      listAttractionPlacesForCatalogue(database.db, hotelId),
    ]);
    const visible = buildEligiblePlaces({
      hotelId,
      hotelPlaceId: GURJAANI_PILOT_IDS.techparkPlace,
      facilities: [],
      partnerships: [],
      contracts,
      attractions,
      now: new Date(),
    }).map((entry) => entry.place.id);

    assert.ok(visible.includes(idOf("Kvelatsminda Church of All Saints")));
    assert.ok(visible.includes(idOf("Akhtala Mud Volcano Park")));
    assert.ok(!visible.includes(idOf("Nato Vachnadze House Museum")), "unconfirmed opening stays hidden");
    assert.ok(!visible.includes(idOf("Numisi Wine Cellar Museum")), "a business waits for a confirmed contract");
    assert.ok(!visible.includes(idOf("Garden (Tvisi)")));
    assert.ok(!visible.includes(GURJAANI_PILOT_IDS.techparkPlace), "the base is never a destination");
    assert.equal(visible.length, GURJAANI_PILOT_PLACES.filter((p) => p.kind === "attraction" && p.confirmedOpen !== false).length);
  });
});
