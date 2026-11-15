import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { after, before, describe, it } from "node:test";
import { buildEligiblePlaces, type FacilityRow } from "@/services/eligibility/rules";
import { hashQrToken } from "@/services/qr/token";
import { createTestDatabase, expectSqlFailure, type TestDatabase } from "./test-support/pglite";
import { listDayProgram, replaceDayProgramWithAudit } from "./operations/hotel-day-program";
import { listAttractionPlacesForCatalogue, listContractRowsForCatalogue } from "./operations/atlas-contracts";
import {
  SKILLWILL_ACTIVE_CONTRACT_PLACES,
  SKILLWILL_AREA_PLACES,
  SKILLWILL_DAY_PROGRAM,
  SKILLWILL_GAMEZONE_OLD_NAME,
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
  it("adds Skillwill as a hotel, every place, a contract per business (only Bangkok and Tema active), the day program and one QR code each", async () => {
    const result = await seedSkillwillTest(database.db);
    codes = result.codes;
    assert.equal(result.hotel, true);
    assert.equal(result.places, ALL.length + SKILLWILL_TEST_FACILITIES.length);
    assert.equal(result.facilities, SKILLWILL_TEST_FACILITIES.length);
    assert.equal(result.contracts, ALL.filter((place) => place.kind === "business").length);
    assert.equal(result.activatedContracts, 2);
    assert.equal(result.program, true);
    const contracts = await database.db.select().from(database.schema.atlasPartnerContracts);
    const activeIds = new Set(SKILLWILL_ACTIVE_CONTRACT_PLACES.map(idOf));
    for (const contract of contracts) {
      assert.equal(contract.status, activeIds.has(contract.placeId) ? "active" : "pending_review", "only the owner-approved contracts are active");
    }
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
    assert.deepEqual(await seedSkillwillTest(database.db), {
      hotel: false,
      places: 0,
      contracts: 0,
      facilities: 0,
      activatedContracts: 0,
      program: false,
      codes: [],
    });
  });

  it("shows a Skillwill guest the attractions, the facilities, Bangkok and Tema; other cafés only after their contracts are confirmed; never Skillwill itself", async () => {
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
    for (const name of SKILLWILL_ACTIVE_CONTRACT_PLACES) assert.ok(visible.includes(idOf(name)), `${name}: active contract, eligible`);
    assert.equal(visible.length, ALL.filter((p) => p.kind === "attraction").length + SKILLWILL_TEST_FACILITIES.length + SKILLWILL_ACTIVE_CONTRACT_PLACES.length);
    for (const facility of SKILLWILL_TEST_FACILITIES) assert.ok(visible.includes(facilityPlaceId(facility.name)), `${facility.name} is shown to Skillwill guests`);
  });

  it("adds Kombinati, Gamezone, both Auditoriums and the Fablab as Skillwill's own active facilities, published, verified, QR check-in only, with a code and no contract", async () => {
    assert.deepEqual(
      SKILLWILL_TEST_FACILITIES.map((facility) => facility.name),
      ["Kombinati", "Gamezone", "Auditorium 402", "Auditorium 102", "Fablab"]
    );
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
      const live = await database.db.select().from(database.schema.qrCredentials).where(eq(database.schema.qrCredentials.placeId, placeId));
      assert.equal(live.length, 1, `${facility.name} has its check-in code`);
    }
  });

  it("Tema: a hand-picked restaurant at 14 Bochorma Street, default check-in, active contract confirmed now with no end", async () => {
    const { places, atlasPartnerContracts } = database.schema;
    const [tema] = await database.db.select().from(places).where(eq(places.id, idOf("Tema")));
    assert.deepEqual([tema.name, tema.category, tema.kind, tema.address, tema.latitude, tema.longitude, tema.checkInMethod], [
      "Tema",
      "restaurant",
      "business",
      "14 Bochorma Street, Tbilisi",
      41.686092,
      44.830502,
      "qr_or_gps",
    ]);
    for (const name of SKILLWILL_ACTIVE_CONTRACT_PLACES) {
      const [contract] = await database.db.select().from(atlasPartnerContracts).where(eq(atlasPartnerContracts.placeId, idOf(name)));
      assert.equal(contract.status, "active", name);
      assert.ok(contract.confirmedAt && contract.startsAt && contract.startsAt <= new Date(), name);
      assert.equal(contract.endsAt, null, name);
    }
  });

  it("renames PlayStation Room to Gamezone, keeping its id and code, and never overwrites an admin's rename", async () => {
    const { places, qrCredentials } = database.schema;
    const gamezoneId = facilityPlaceId("Gamezone");
    const codesBefore = await database.db.select().from(qrCredentials).where(eq(qrCredentials.placeId, gamezoneId));
    await database.db.update(places).set({ name: SKILLWILL_GAMEZONE_OLD_NAME }).where(eq(places.id, gamezoneId));
    await seedSkillwillTest(database.db);
    const nameNow = async () => (await database.db.select().from(places).where(eq(places.id, gamezoneId)))[0].name;
    assert.equal(await nameNow(), "Gamezone");
    await seedSkillwillTest(database.db);
    assert.equal(await nameNow(), "Gamezone", "idempotent");
    await database.db.update(places).set({ name: "Arcade" }).where(eq(places.id, gamezoneId));
    await seedSkillwillTest(database.db);
    assert.equal(await nameNow(), "Arcade", "an admin's rename stands");
    assert.deepEqual(await database.db.select().from(qrCredentials).where(eq(qrCredentials.placeId, gamezoneId)), codesBefore, "same code");
    await database.db.update(places).set({ name: "Gamezone" }).where(eq(places.id, gamezoneId));
  });

  it("never touches a contract an admin changed after the activation", async () => {
    const { atlasPartnerContracts } = database.schema;
    const temaId = idOf("Tema");
    await database.db.update(atlasPartnerContracts).set({ status: "suspended" }).where(eq(atlasPartnerContracts.placeId, temaId));
    assert.equal((await seedSkillwillTest(database.db)).activatedContracts, 0);
    const [contract] = await database.db.select().from(atlasPartnerContracts).where(eq(atlasPartnerContracts.placeId, temaId));
    assert.equal(contract.status, "suspended");
    await database.db.update(atlasPartnerContracts).set({ status: "active" }).where(eq(atlasPartnerContracts.placeId, temaId));
  });

  it("inserts Skillwill's day program once, in the owner's order, and never over an admin's program", async () => {
    const nameOf = new Map<string, string>([
      ...SKILLWILL_TEST_PLACES.map((place) => [skillwillPlaceId(place), place.name] as const),
      ...SKILLWILL_TEST_FACILITIES.map((facility) => [skillwillPlaceId(facility), facility.name] as const),
    ]);
    const program = await listDayProgram(database.db, SKILLWILL_TEST_IDS.hotel);
    assert.deepEqual(
      program.map((step) => step.placeIds.map((id) => nameOf.get(id))),
      SKILLWILL_DAY_PROGRAM.map((step) => [...step])
    );
    assert.deepEqual(program.map((step) => step.position), [1, 2, 3]);

    const [admin] = await database.db.insert(database.schema.users).values({ email: "program-admin@example.test", passwordHash: "x", role: "admin" }).returning();
    const own = [[facilityPlaceId("Fablab")]];
    assert.deepEqual(await replaceDayProgramWithAudit(database.db, { actorUserId: admin.id, hotelId: SKILLWILL_TEST_IDS.hotel, steps: own }), { ok: true, changed: true });
    assert.equal((await seedSkillwillTest(database.db)).program, false);
    assert.deepEqual((await listDayProgram(database.db, SKILLWILL_TEST_IDS.hotel)).map((step) => step.placeIds), own, "the admin's program stands");
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

describe("Hotel day program (migration 0041)", () => {
  const hotelId = SKILLWILL_TEST_IDS.hotel;
  const placeA = skillwillPlaceId(SKILLWILL_TEST_PLACES[0]);
  const placeB = skillwillPlaceId(SKILLWILL_TEST_PLACES[1]);
  const placeC = skillwillPlaceId(SKILLWILL_TEST_PLACES[2]);
  const placeD = skillwillPlaceId(SKILLWILL_TEST_PLACES[3]);
  let adminId: string;
  before(async () => {
    const [admin] = await database.db.insert(database.schema.users).values({ email: "day-program@example.test", passwordHash: "x", role: "admin" }).returning();
    adminId = admin.id;
  });

  it("the database refuses 0 or 4+ places, a position outside 1-4, and two steps at one position", async () => {
    const { hotelDayProgramSteps } = database.schema;
    await database.db.delete(hotelDayProgramSteps).where(eq(hotelDayProgramSteps.hotelId, hotelId));
    assert.equal(await expectSqlFailure(() => database.db.insert(hotelDayProgramSteps).values({ hotelId, position: 1, placeIds: [] })), "23514");
    assert.equal(
      await expectSqlFailure(() => database.db.insert(hotelDayProgramSteps).values({ hotelId, position: 1, placeIds: [placeA, placeB, placeC, placeD] })),
      "23514"
    );
    for (const position of [0, 5]) {
      assert.equal(await expectSqlFailure(() => database.db.insert(hotelDayProgramSteps).values({ hotelId, position, placeIds: [placeA] })), "23514");
    }
    await database.db.insert(hotelDayProgramSteps).values({ hotelId, position: 1, placeIds: [placeA] });
    assert.equal(await expectSqlFailure(() => database.db.insert(hotelDayProgramSteps).values({ hotelId, position: 1, placeIds: [placeB] })), "23505");
    await database.db.delete(hotelDayProgramSteps).where(eq(hotelDayProgramSteps.hotelId, hotelId));
  });

  it("an admin save replaces the program with one hotel.updated entry (before/after); the same program again writes nothing", async () => {
    const { adminAuditEvents } = database.schema;
    const steps = [[placeA, placeB], [placeC]];
    assert.deepEqual(await replaceDayProgramWithAudit(database.db, { actorUserId: adminId, hotelId, steps }), { ok: true, changed: true });
    assert.deepEqual(await listDayProgram(database.db, hotelId), [
      { position: 1, placeIds: [placeA, placeB] },
      { position: 2, placeIds: [placeC] },
    ]);
    const events = await database.db.select().from(adminAuditEvents).where(eq(adminAuditEvents.actorUserId, adminId));
    assert.equal(events.length, 1);
    assert.deepEqual([events[0].action, events[0].targetId, events[0].before, events[0].after], ["hotel.updated", hotelId, { dayProgram: [] }, { dayProgram: steps }]);
    assert.deepEqual(await replaceDayProgramWithAudit(database.db, { actorUserId: adminId, hotelId, steps }), { ok: true, changed: false });
    assert.equal((await database.db.select().from(adminAuditEvents).where(eq(adminAuditEvents.actorUserId, adminId))).length, 1);
  });

  it("refuses an invalid program before writing anything, and reports a missing hotel", async () => {
    assert.equal((await replaceDayProgramWithAudit(database.db, { actorUserId: adminId, hotelId, steps: [[placeA], [placeA]] })).ok, false);
    assert.equal((await replaceDayProgramWithAudit(database.db, { actorUserId: adminId, hotelId, steps: [[placeA], [placeB], [placeC], [placeD], [placeA]] })).ok, false);
    assert.deepEqual(
      await replaceDayProgramWithAudit(database.db, { actorUserId: adminId, hotelId: "5c111000-0000-4000-8000-000000000998", steps: [] }),
      { ok: false, reason: "no_hotel" }
    );
    assert.equal((await listDayProgram(database.db, hotelId)).length, 2, "unchanged");
  });

  it("rolls the program back when the audit entry cannot be written", async () => {
    await assert.rejects(
      replaceDayProgramWithAudit(database.db, { actorUserId: "5c111000-0000-4000-8000-000000000997", hotelId, steps: [[placeD]] })
    );
    assert.deepEqual((await listDayProgram(database.db, hotelId)).map((step) => step.placeIds), [[placeA, placeB], [placeC]]);
  });

  it("clearing every step removes the program (back to the normal plan), audited", async () => {
    assert.deepEqual(await replaceDayProgramWithAudit(database.db, { actorUserId: adminId, hotelId, steps: [] }), { ok: true, changed: true });
    assert.deepEqual(await listDayProgram(database.db, hotelId), []);
  });
});
