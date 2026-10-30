import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { buildEligiblePlaces, type FacilityRow, type PartnershipRow } from "@/services/eligibility/rules";
import { DEV_FIXTURE_EMAILS, DEV_FIXTURE_IDS, FIXTURE_PLACE_COUNT, seedDevFixtures } from "./operations/dev-seed";
import { createTestDatabase, type TestDatabase } from "./test-support/pglite";

/**
 * The development fixtures, proved against the real migrations by calling the
 * real seeding operation — not a copy of its SQL.
 *
 * The point is not that rows appear. It is that the fixture set actually
 * demonstrates the hotel-specific eligibility rule it claims to demonstrate:
 * if a later edit quietly makes the "unaffiliated" Place visible, or forgets a
 * publication timestamp so a partner vanishes, these fail.
 */
describe("development fixtures", () => {
  let harness: TestDatabase;
  const NOW = new Date("2026-10-16T10:00:00Z");

  before(async () => {
    harness = await createTestDatabase();
  });

  after(async () => {
    await harness.close();
  });

  /** The eligibility rules are pure functions over rows; this loads the rows the real service would load. */
  async function eligibleFor(hotelId: string, hotelPlaceId: string) {
    const { db, schema } = harness;

    const partnershipRows = await db
      .select({ partnership: schema.hotelPartnerships, place: schema.places })
      .from(schema.hotelPartnerships)
      .innerJoin(schema.places, eq(schema.places.id, schema.hotelPartnerships.placeId))
      .where(eq(schema.hotelPartnerships.hotelId, hotelId));

    const facilityRows = await db
      .select({ facility: schema.hotelFacilities, place: schema.places })
      .from(schema.hotelFacilities)
      .innerJoin(schema.places, eq(schema.places.id, schema.hotelFacilities.placeId))
      .where(eq(schema.hotelFacilities.hotelId, hotelId));

    const partnerships: PartnershipRow[] = partnershipRows.map((row) => ({
      id: row.partnership.id,
      hotelId: row.partnership.hotelId,
      placeId: row.partnership.placeId,
      status: row.partnership.status,
      startsAt: row.partnership.startsAt,
      endsAt: row.partnership.endsAt,
      confirmedAt: row.partnership.confirmedAt,
      priority: row.partnership.priority,
      place: row.place,
    }));

    const facilities: FacilityRow[] = facilityRows.map((row) => ({
      id: row.facility.id,
      hotelId: row.facility.hotelId,
      placeId: row.facility.placeId,
      status: row.facility.status,
      facilityType: row.facility.facilityType,
      place: row.place,
    }));

    return buildEligiblePlaces({ hotelId, hotelPlaceId, partnerships, facilities, now: NOW }).map(
      (entry) => entry.place.name
    );
  }

  test("seeding creates the admin and the guest with the roles the fixtures promise", async () => {
    await seedDevFixtures(harness.db, {
      adminPasswordHash: "hash-admin",
      guestPasswordHash: "hash-guest",
      now: NOW,
    });

    const rows = await harness.db
      .select()
      .from(harness.schema.users)
      .where(inArray(harness.schema.users.email, [DEV_FIXTURE_EMAILS.admin, DEV_FIXTURE_EMAILS.guest]));

    const byEmail = new Map(rows.map((row) => [row.email, row]));
    assert.equal(byEmail.get(DEV_FIXTURE_EMAILS.admin)?.role, "admin");
    assert.equal(byEmail.get(DEV_FIXTURE_EMAILS.guest)?.role, "user");
  });

  test("the reported fixture count matches the Places actually written", async () => {
    // The seeding operation may not read the places table (guest-paths.test.ts), so it
    // reports a constant. This is the check that keeps that constant honest.
    const rows = await harness.db.select().from(harness.schema.places);
    assert.equal(rows.length, FIXTURE_PLACE_COUNT);
  });

  test("the guest starts with an active stay at Hotel A, so no QR scan is needed to use the app", async () => {
    const stays = await harness.db
      .select()
      .from(harness.schema.hotelStays)
      .where(eq(harness.schema.hotelStays.userId, DEV_FIXTURE_IDS.guestUser));

    assert.equal(stays.length, 1);
    assert.equal(stays[0]?.hotelId, DEV_FIXTURE_IDS.hotelA);
    assert.equal(stays[0]?.checkOut, null);
  });

  test("no QR credential is seeded — raw codes are revealed once, in the admin UI, never by a script", async () => {
    const credentials = await harness.db.select().from(harness.schema.qrCredentials);
    assert.deepEqual(credentials, []);
  });

  test("Hotel A's guest sees its own facility and both of its active partners", async () => {
    const names = await eligibleFor(DEV_FIXTURE_IDS.hotelA, DEV_FIXTURE_IDS.hotelAPlace);
    assert.deepEqual(new Set(names), new Set(["[Test] Riverside Sauna", "[Test] Partner Cafe", "[Test] Old Town Walking Tour"]));
  });

  test("Hotel B's guest sees only the partner Hotel B has its own row for", async () => {
    const names = await eligibleFor(DEV_FIXTURE_IDS.hotelB, DEV_FIXTURE_IDS.hotelBPlace);
    assert.deepEqual(names, ["[Test] Old Town Walking Tour"]);
  });

  test("Hotel A's facility is not eligible for Hotel B, and Hotel A's cafe is not either", async () => {
    const names = await eligibleFor(DEV_FIXTURE_IDS.hotelB, DEV_FIXTURE_IDS.hotelBPlace);
    assert.ok(!names.includes("[Test] Riverside Sauna"));
    assert.ok(!names.includes("[Test] Partner Cafe"));
  });

  test("the unaffiliated Place is published and verified yet eligible for nobody", async () => {
    const [gallery] = await harness.db
      .select()
      .from(harness.schema.places)
      .where(eq(harness.schema.places.id, DEV_FIXTURE_IDS.galleryPlace));

    // Fit to show in every respect EXCEPT a hotel relationship — which is the only thing that matters.
    assert.equal(gallery?.publicationStatus, "published");
    assert.equal(gallery?.verificationStatus, "verified");

    for (const hotel of [
      [DEV_FIXTURE_IDS.hotelA, DEV_FIXTURE_IDS.hotelAPlace],
      [DEV_FIXTURE_IDS.hotelB, DEV_FIXTURE_IDS.hotelBPlace],
    ] as const) {
      const names = await eligibleFor(hotel[0], hotel[1]);
      assert.ok(!names.includes("[Test] Unaffiliated Gallery"));
    }
  });

  test("the suspended partnership is excluded even though an admin confirmed it", async () => {
    const [partnership] = await harness.db
      .select()
      .from(harness.schema.hotelPartnerships)
      .where(eq(harness.schema.hotelPartnerships.id, DEV_FIXTURE_IDS.wineBarPartnershipA));

    assert.equal(partnership?.status, "suspended");
    assert.notEqual(partnership?.confirmedAt, null);

    const names = await eligibleFor(DEV_FIXTURE_IDS.hotelA, DEV_FIXTURE_IDS.hotelAPlace);
    assert.ok(!names.includes("[Test] Suspended Wine Bar"));
  });

  test("re-running the seed changes nothing and never rewrites an existing password", async () => {
    const before = await harness.db.select().from(harness.schema.places);
    const beforeStays = await harness.db.select().from(harness.schema.hotelStays);

    await seedDevFixtures(harness.db, {
      adminPasswordHash: "a-different-hash",
      guestPasswordHash: "a-different-hash",
      now: new Date("2026-10-17T10:00:00Z"),
    });

    const after = await harness.db.select().from(harness.schema.places);
    const afterStays = await harness.db.select().from(harness.schema.hotelStays);
    assert.equal(after.length, before.length);
    assert.equal(afterStays.length, beforeStays.length);

    const [admin] = await harness.db
      .select()
      .from(harness.schema.users)
      .where(eq(harness.schema.users.email, DEV_FIXTURE_EMAILS.admin));
    assert.equal(admin?.passwordHash, "hash-admin", "an existing account's password must survive a re-seed");
  });
});
