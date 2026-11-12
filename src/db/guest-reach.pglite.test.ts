import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, ne, and, notExists } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "./test-support/pglite";
import {
  listAttractionPlacesForCatalogue,
  listContractRowsForCatalogue,
  listGuestReachCandidates,
  listHotelsForGuestReach,
} from "./operations/atlas-contracts";
import { listEligiblePlacesForStay, listGuestReachForAdmin, type GuestReachDependencies } from "@/services/eligibility";
import type { FacilityRow, PartnershipRow } from "@/services/eligibility/rules";

/**
 * CAND-03: the console's Guest reach verdict is the guest catalogue's verdict. Real migrations, real catalogue SQL;
 * the facility and partnership reads mirror db/queries/hotel-facilities.ts and hotel-partnerships.ts, which import
 * `server-only` and so cannot be loaded here.
 */

const NOW = new Date("2026-11-12T10:00:00Z");
const DAY = 86_400_000;

let database: TestDatabase;
let deps: GuestReachDependencies;
let adminId: string;
const hotelsByName: Record<string, { hotelId: string; hotelPlaceId: string }> = {};
const placeIds: Record<string, string> = {};

async function insertPlace(name: string, kind: "business" | "attraction" | "hotel", options: { published?: boolean; verified?: boolean } = {}) {
  const { db, schema } = database;
  const published = options.published ?? true;
  const verified = options.verified ?? true;
  const [row] = await db
    .insert(schema.places)
    .values({
      name,
      latitude: 41.7,
      longitude: 44.8,
      category: kind === "hotel" ? "hotel" : kind === "attraction" ? "landmark" : "restaurant",
      kind,
      kindConfirmedAt: NOW,
      publicationStatus: published ? "published" : "draft",
      publishedAt: published ? NOW : null,
      verificationStatus: verified ? "verified" : "unverified",
      verifiedAt: verified ? NOW : null,
    })
    .returning();
  placeIds[name] = row.id;
  return row;
}

async function insertHotel(name: string) {
  const place = await insertPlace(name, "hotel");
  const [hotel] = await database.db.insert(database.schema.hotels).values({ placeId: place.id }).returning();
  hotelsByName[name] = { hotelId: hotel.id, hotelPlaceId: place.id };
  return hotel;
}

async function contract(placeId: string, values: Partial<typeof database.schema.atlasPartnerContracts.$inferInsert>) {
  await database.db.insert(database.schema.atlasPartnerContracts).values({ placeId, ...values });
}

before(async () => {
  database = await createTestDatabase();
  const { db, schema } = database;
  const [admin] = await db.insert(schema.users).values({ email: "reach-admin@example.test", passwordHash: "x", role: "admin" }).returning();
  adminId = admin.id;

  const hotelA = await insertHotel("Hotel A");
  await insertHotel("Hotel B");

  const active = { status: "active" as const, confirmedAt: new Date(NOW.getTime() - DAY), confirmedBy: adminId };

  const contracted = await insertPlace("Contracted Cafe", "business");
  await contract(contracted.id, active);

  await insertPlace("Uncontracted Bistro", "business");

  const pending = await insertPlace("Pending Bar", "business");
  await contract(pending.id, { status: "pending_review" });

  const suspended = await insertPlace("Suspended Tavern", "business");
  await contract(suspended.id, { status: "suspended", confirmedAt: new Date(NOW.getTime() - 5 * DAY) });

  const expired = await insertPlace("Expired Winery", "business");
  await contract(expired.id, { ...active, startsAt: new Date(NOW.getTime() - 30 * DAY), endsAt: new Date(NOW.getTime() - DAY) });

  const promoted = await insertPlace("Promoted Grill", "business");
  await contract(promoted.id, active);
  await db.insert(schema.hotelPartnerships).values({
    hotelId: hotelA.id,
    placeId: promoted.id,
    status: "active",
    confirmedAt: NOW,
    confirmedBy: adminId,
    featured: true,
  });

  // A hotel promotion of a business with no contract promotes nothing and shows nothing.
  const promotedOnly = await insertPlace("Partnership Only Pub", "business");
  await db.insert(schema.hotelPartnerships).values({ hotelId: hotelA.id, placeId: promotedOnly.id, status: "active", confirmedAt: NOW, confirmedBy: adminId });

  await insertPlace("Old Fortress", "attraction");
  await insertPlace("Draft Viewpoint", "attraction", { published: false });

  const spa = await insertPlace("Hotel A Spa", "business");
  await db.insert(schema.hotelFacilities).values({ hotelId: hotelA.id, placeId: spa.id, facilityType: "spa", status: "active" });

  const pool = await insertPlace("Hotel A Pool", "business");
  await db.insert(schema.hotelFacilities).values({ hotelId: hotelA.id, placeId: pool.id, facilityType: "pool", status: "inactive" });

  deps = {
    listHotels: () => listHotelsForGuestReach(db),
    listCandidates: () => listGuestReachCandidates(db),
    listContractsForCatalogue: (hotelId, bounds) => listContractRowsForCatalogue(db, hotelId, bounds),
    listAttractionsForCatalogue: (hotelId, bounds) => listAttractionPlacesForCatalogue(db, hotelId, bounds),
    listFacilitiesForHotel: async (hotelId): Promise<FacilityRow[]> =>
      db
        .select({
          id: schema.hotelFacilities.id,
          hotelId: schema.hotelFacilities.hotelId,
          placeId: schema.hotelFacilities.placeId,
          status: schema.hotelFacilities.status,
          facilityType: schema.hotelFacilities.facilityType,
          place: schema.places,
        })
        .from(schema.hotelFacilities)
        .innerJoin(schema.places, eq(schema.hotelFacilities.placeId, schema.places.id))
        .where(eq(schema.hotelFacilities.hotelId, hotelId)),
    listPartnershipsForHotel: async (hotelId): Promise<PartnershipRow[]> =>
      db
        .select({
          id: schema.hotelPartnerships.id,
          hotelId: schema.hotelPartnerships.hotelId,
          placeId: schema.hotelPartnerships.placeId,
          status: schema.hotelPartnerships.status,
          startsAt: schema.hotelPartnerships.startsAt,
          endsAt: schema.hotelPartnerships.endsAt,
          confirmedAt: schema.hotelPartnerships.confirmedAt,
          priority: schema.hotelPartnerships.priority,
          featured: schema.hotelPartnerships.featured,
          offerText: schema.hotelPartnerships.offerText,
          place: schema.places,
        })
        .from(schema.hotelPartnerships)
        .innerJoin(schema.places, eq(schema.hotelPartnerships.placeId, schema.places.id))
        .where(
          and(
            eq(schema.hotelPartnerships.hotelId, hotelId),
            notExists(
              db
                .select({ id: schema.hotelFacilities.id })
                .from(schema.hotelFacilities)
                .where(and(eq(schema.hotelFacilities.placeId, schema.places.id), ne(schema.hotelFacilities.hotelId, hotelId)))
            )
          )
        ),
  };
});

after(async () => {
  await database.close();
});

async function reachOf(name: string) {
  const rows = await listGuestReachForAdmin(NOW, deps);
  const row = rows.find((candidate) => candidate.place.id === placeIds[name]);
  assert.ok(row, `${name} is listed`);
  return row;
}

async function guestSees(hotelName: string, placeName: string) {
  const hotel = hotelsByName[hotelName];
  const eligible = await listEligiblePlacesForStay({ hotel: { id: hotel.hotelId }, place: { id: hotel.hotelPlaceId } }, NOW, deps);
  return eligible.some((entry) => entry.place.id === placeIds[placeName]);
}

describe("Guest reach matches the guest catalogue", () => {
  it("lists no hotel as a destination", async () => {
    const rows = await listGuestReachForAdmin(NOW, deps);
    assert.ok(!rows.some((row) => row.place.kind === "hotel"));
  });

  it("a contracted business with no hotel promotion is visible to every hotel's guests", async () => {
    const row = await reachOf("Contracted Cafe");
    assert.equal(row.visibleEverywhere, true);
    assert.deepEqual(row.sources, ["partner"]);
    assert.deepEqual(row.promotedBy, []);
    assert.deepEqual(row.hiddenReasons, []);
    assert.equal(await guestSees("Hotel A", "Contracted Cafe"), true);
    assert.equal(await guestSees("Hotel B", "Contracted Cafe"), true);
  });

  it("an uncontracted business is hidden, with the reason", async () => {
    const row = await reachOf("Uncontracted Bistro");
    assert.deepEqual(row.visibleAtHotels, []);
    assert.deepEqual(row.hiddenReasons, ["no_contract"]);
    assert.equal(await guestSees("Hotel A", "Uncontracted Bistro"), false);
    assert.equal(await guestSees("Hotel B", "Uncontracted Bistro"), false);
  });

  it("pending, suspended and expired contracts are hidden, each with its reason", async () => {
    for (const [name, reason] of [
      ["Pending Bar", "contract_pending_review"],
      ["Suspended Tavern", "contract_suspended"],
      ["Expired Winery", "contract_expired"],
    ] as const) {
      const row = await reachOf(name);
      assert.deepEqual(row.visibleAtHotels, [], name);
      assert.deepEqual(row.hiddenReasons, [reason], name);
      assert.equal(await guestSees("Hotel A", name), false, name);
    }
  });

  it("a promotion is shown separately and changes nothing about visibility", async () => {
    const promoted = await reachOf("Promoted Grill");
    assert.equal(promoted.visibleEverywhere, true);
    assert.deepEqual(
      promoted.promotedBy.map((hotel) => [hotel.name, hotel.featured]),
      [["Hotel A", true]]
    );
    const promotionOnly = await reachOf("Partnership Only Pub");
    assert.deepEqual(promotionOnly.visibleAtHotels, []);
    assert.deepEqual(promotionOnly.promotedBy, []);
    assert.deepEqual(promotionOnly.hiddenReasons, ["no_contract"]);
    assert.equal(await guestSees("Hotel A", "Partnership Only Pub"), false);
  });

  it("an attraction is visible everywhere without a contract; an unpublished one says so", async () => {
    const fortress = await reachOf("Old Fortress");
    assert.equal(fortress.visibleEverywhere, true);
    assert.deepEqual(fortress.sources, ["attraction"]);
    assert.equal(await guestSees("Hotel B", "Old Fortress"), true);
    const draft = await reachOf("Draft Viewpoint");
    assert.deepEqual(draft.visibleAtHotels, []);
    assert.deepEqual(draft.hiddenReasons, ["unpublished"]);
  });

  it("a facility is visible only to its own hotel's guests; an inactive one is hidden with the reason", async () => {
    const spa = await reachOf("Hotel A Spa");
    assert.equal(spa.visibleEverywhere, false);
    assert.deepEqual(spa.visibleAtHotels.map((hotel) => hotel.name), ["Hotel A"]);
    assert.deepEqual(spa.sources, ["facility"]);
    assert.equal(await guestSees("Hotel A", "Hotel A Spa"), true);
    assert.equal(await guestSees("Hotel B", "Hotel A Spa"), false);

    const pool = await reachOf("Hotel A Pool");
    assert.deepEqual(pool.visibleAtHotels, []);
    assert.deepEqual(pool.hiddenReasons, ["facility_inactive"]);
  });

  it("for every Place and hotel, the console and the guest catalogue agree", async () => {
    const rows = await listGuestReachForAdmin(NOW, deps);
    for (const row of rows) {
      for (const hotelName of Object.keys(hotelsByName)) {
        const consoleSays = row.visibleAtHotels.some((hotel) => hotel.name === hotelName);
        assert.equal(consoleSays, await guestSees(hotelName, row.place.name), `${row.place.name} at ${hotelName}`);
        if (!consoleSays && row.visibleAtHotels.length === 0) assert.ok(row.hiddenReasons.length > 0, `${row.place.name} names a reason`);
      }
    }
  });
});
