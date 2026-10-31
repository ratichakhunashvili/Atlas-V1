import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createTestDatabase, type TestDatabase } from "./test-support/pglite";
import { dashboardCounts, hotelEngagement, recentUse } from "./operations/admin-metrics";

/**
 * Dashboard and analytics figures against the real migrations. Each number must come from rows that exist, with the
 * stated window — and a relationship that is not currently active must not be dressed up as one.
 */

const NOW = new Date("2026-10-19T12:00:00Z");
const DAY = 86_400_000;
const since = new Date(NOW.getTime() - 7 * DAY);
const until = new Date(NOW.getTime() + DAY);

let database: TestDatabase;
let hotelId: string;
let facilityPlaceId: string;
let partnerPlaceId: string;
let formerPartnerPlaceId: string;
let guestA: string;
let guestB: string;

before(async () => {
  database = await createTestDatabase();
  const { db, schema } = database;

  const mk = async (name: string, category: "hotel" | "spa" | "restaurant", extra: object = {}) => {
    const [place] = await db
      .insert(schema.places)
      .values({
        name,
        latitude: 41.7,
        longitude: 44.8,
        category,
        publicationStatus: "published",
        publishedAt: NOW,
        verificationStatus: "verified",
        verifiedAt: NOW,
        ...extra,
      })
      .returning();
    return place;
  };

  const hotelPlace = await mk("[Test] Metrics Hotel", "hotel");
  facilityPlaceId = (await mk("[Test] Metrics Spa", "spa")).id;
  partnerPlaceId = (await mk("[Test] Metrics Cafe", "restaurant")).id;
  formerPartnerPlaceId = (await mk("[Test] Metrics Former Partner", "restaurant")).id;
  await mk("[Test] Draft place", "restaurant", { publicationStatus: "draft", publishedAt: null });
  await mk("[Test] Archived place", "restaurant", { archivedAt: NOW, publicationStatus: "draft", publishedAt: null });

  const [hotel] = await db.insert(schema.hotels).values({ placeId: hotelPlace.id }).returning();
  hotelId = hotel.id;
  await db.insert(schema.hotelFacilities).values({ hotelId, placeId: facilityPlaceId, facilityType: "spa" });

  // Partnerships: one in-window active, one pending, one active but expired, one revoked (the former partner).
  await db.insert(schema.hotelPartnerships).values([
    { hotelId, placeId: partnerPlaceId, status: "active", confirmedAt: NOW, startsAt: new Date(NOW.getTime() - DAY), endsAt: new Date(NOW.getTime() + 30 * DAY) },
    { hotelId, placeId: formerPartnerPlaceId, status: "revoked", confirmedAt: NOW, revokedAt: NOW },
  ]);
  const expiredPlace = await mk("[Test] Expired partner", "restaurant");
  const pendingPlace = await mk("[Test] Pending partner", "restaurant");
  await db.insert(schema.hotelPartnerships).values([
    { hotelId, placeId: expiredPlace.id, status: "active", confirmedAt: NOW, endsAt: new Date(NOW.getTime() - DAY) },
    { hotelId, placeId: pendingPlace.id, status: "pending_review" },
  ]);

  await db.insert(schema.hotelEvents).values([
    { hotelId, venuePlaceId: facilityPlaceId, title: "Upcoming", startsAt: new Date(NOW.getTime() + DAY), endsAt: new Date(NOW.getTime() + 2 * DAY) },
    { hotelId, venuePlaceId: facilityPlaceId, title: "Cancelled", startsAt: new Date(NOW.getTime() + DAY), endsAt: new Date(NOW.getTime() + 2 * DAY), status: "cancelled" },
    { hotelId, venuePlaceId: facilityPlaceId, title: "Past", startsAt: new Date(NOW.getTime() - 3 * DAY), endsAt: new Date(NOW.getTime() - 2 * DAY) },
  ]);

  await db.insert(schema.qrCredentials).values([
    { purpose: "hotel_entry", hotelId, tokenHash: "hash-active" },
    { purpose: "hotel_entry", hotelId, tokenHash: "hash-revoked", revokedAt: NOW },
    { purpose: "place_check_in", placeId: partnerPlaceId, tokenHash: "hash-expired", expiresAt: new Date(NOW.getTime() - DAY) },
  ]);

  const [a] = await db.insert(schema.users).values({ email: "metrics-a@example.test", passwordHash: "x" }).returning();
  const [b] = await db.insert(schema.users).values({ email: "metrics-b@example.test", passwordHash: "x", role: "admin" }).returning();
  guestA = a.id;
  guestB = b.id;
  await db.insert(schema.hotelStays).values([
    { userId: guestA, hotelId, checkIn: new Date(NOW.getTime() - DAY) },
    { userId: guestB, hotelId, checkIn: new Date(NOW.getTime() - 30 * DAY), checkOut: new Date(NOW.getTime() - 25 * DAY) },
  ]);

  // Guest A: plans on two days, three visits (facility, current partner, former partner).
  const [day1] = await db
    .insert(schema.itineraryDays)
    .values({ userId: guestA, hotelId, dayNumber: 1, stopCount: 3, generatedAt: new Date(NOW.getTime() - DAY), completedAt: NOW })
    .returning();
  await db.insert(schema.itineraryDays).values({ userId: guestA, hotelId, dayNumber: 2, stopCount: 1, generatedAt: NOW });
  const stop = (placeId: string, position: number, visitedAt: Date | null, extra: object = {}) => ({
    dayId: day1.id,
    placeId,
    checkInMethod: "gps" as const,
    name: `stop ${position}`,
    latitude: 41.7,
    longitude: 44.8,
    position,
    visitedAt,
    ...extra,
  });
  await db.insert(schema.itineraryStops).values([
    stop(facilityPlaceId, 0, NOW),
    stop(partnerPlaceId, 1, NOW),
    stop(formerPartnerPlaceId, 2, NOW),
    stop(partnerPlaceId, 3, null),
    stop(partnerPlaceId, 4, null, { supersededAt: NOW, supersededReason: "removed_unavailable" }),
  ]);
});

after(async () => {
  await database.close();
});

describe("dashboard counts", () => {
  it("counts only what really qualifies", async () => {
    const counts = await dashboardCounts(database.db, NOW);
    assert.equal(counts.hotels, 1);
    assert.equal(counts.eligibleCapablePlaces, 6, "published + verified + not archived: draft and archived excluded");
    assert.equal(counts.pendingPartnerships, 1);
    assert.equal(counts.activePartnerships, 1, "an active row past its end date is not an active partnership");
    assert.equal(counts.upcomingEvents, 1, "cancelled and past events are not upcoming");
    assert.equal(counts.activeCredentials, 1, "revoked and expired credentials are not active");
    assert.equal(counts.revokedCredentials, 1);
    assert.equal(counts.admins, 1);
  });
});

describe("recent use", () => {
  it("counts generated plans and verified visits inside the window only", async () => {
    const use = await recentUse(database.db, { since, until });
    assert.equal(use.itinerariesGenerated, 2);
    assert.equal(use.verifiedStopVisits, 3, "a pending stop and a superseded stop are not visits (a completed stop can never be superseded: the database forbids it)");

    const earlier = await recentUse(database.db, { since: new Date(NOW.getTime() - 60 * DAY), until: new Date(NOW.getTime() - 40 * DAY) });
    assert.deepEqual(earlier, { itinerariesGenerated: 0, verifiedStopVisits: 0 });
  });
});

describe("hotel engagement", () => {
  it("aggregates per hotel and classifies visits by today's relationships, keeping an honest remainder", async () => {
    const [hotel] = await hotelEngagement(database.db, { since, until });
    assert.equal(hotel.hotelId, hotelId);
    assert.equal(hotel.staysStarted, 1, "the stay that began 30 days ago is outside the window");
    assert.equal(hotel.itinerariesGenerated, 2);
    assert.equal(hotel.itinerariesCompleted, 1);
    assert.equal(hotel.verifiedStopVisits, 3);
    assert.equal(hotel.facilityVisits, 1);
    assert.equal(hotel.partnerVisits, 1);
    assert.equal(hotel.unclassifiedVisits, 1, "the visit to a since-revoked partner is neither bucket");
    assert.equal(hotel.repeatUseStays, 1, "guest A planned on two different days");
  });

  it("exposes no guest identifiers or coordinates", async () => {
    const [hotel] = await hotelEngagement(database.db, { since, until });
    const serialised = JSON.stringify(hotel);
    for (const forbidden of [guestA, guestB, "metrics-a@example.test", "latitude", "longitude"]) {
      assert.equal(serialised.includes(forbidden), false, forbidden);
    }
  });
});
