import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { and, eq, isNull, ne, notExists } from "drizzle-orm";
import { createTestDatabase, type TestDatabase } from "./test-support/pglite";
import { listAttractionPlacesForCatalogue, listContractRowsForCatalogue } from "./operations/atlas-contracts";
import { listHotelEventsInWindow } from "./operations/hotel-events";
import { listUpcomingHotelEventsForGuest, type GuestEventDependencies, type GuestStay } from "@/services/eligibility";
import type { FacilityRow, PartnershipRow } from "@/services/eligibility/rules";

/**
 * Hotel events on the guest map: services/eligibility's listUpcomingHotelEventsForGuest against real migrations, the
 * real event-window SQL (db/operations/hotel-events.ts) and the real catalogue SQL. The stay, facility and partnership
 * reads mirror db/queries/hotel-stays.ts, hotel-facilities.ts and hotel-partnerships.ts, which import `server-only` and
 * so cannot be loaded here.
 */

const NOW = new Date("2026-11-12T10:00:00Z");
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const at = (offset: number) => new Date(NOW.getTime() + offset);

let database: TestDatabase;
let deps: GuestEventDependencies;
let adminId: string;
const users: Record<string, string> = {};
const hotels: Record<string, { hotelId: string; hotelPlaceId: string }> = {};
const places: Record<string, string> = {};
const events: Record<string, string> = {};

async function insertPlace(name: string, kind: "business" | "attraction" | "hotel") {
  const [row] = await database.db
    .insert(database.schema.places)
    .values({
      name,
      latitude: 41.7,
      longitude: 44.8,
      category: kind === "hotel" ? "hotel" : kind === "attraction" ? "landmark" : "restaurant",
      kind,
      kindConfirmedAt: NOW,
      publicationStatus: "published",
      publishedAt: NOW,
      verificationStatus: "verified",
      verifiedAt: NOW,
    })
    .returning();
  places[name] = row.id;
  return row;
}

async function insertHotel(name: string) {
  const place = await insertPlace(name, "hotel");
  const [hotel] = await database.db.insert(database.schema.hotels).values({ placeId: place.id }).returning();
  hotels[name] = { hotelId: hotel.id, hotelPlaceId: place.id };
  return hotel;
}

async function contract(placeName: string, window: { startsAt?: Date; endsAt?: Date } = {}) {
  await database.db.insert(database.schema.atlasPartnerContracts).values({
    placeId: places[placeName],
    status: "active",
    confirmedAt: at(-30 * DAY),
    confirmedBy: adminId,
    ...window,
  });
}

async function guestAt(email: string, hotelName: string | null) {
  const { db, schema } = database;
  const [user] = await db.insert(schema.users).values({ email, passwordHash: "x" }).returning();
  users[email] = user.id;
  if (hotelName) {
    await db
      .insert(schema.hotelStays)
      .values({ userId: user.id, hotelId: hotels[hotelName].hotelId, checkIn: at(-DAY), expectedCheckOut: at(10 * DAY) });
  }
}

async function event(
  key: string,
  values: { hotel: string; venue: string; startsAt: Date; endsAt: Date; status?: "scheduled" | "cancelled" }
) {
  const [row] = await database.db
    .insert(database.schema.hotelEvents)
    .values({
      hotelId: hotels[values.hotel].hotelId,
      venuePlaceId: places[values.venue],
      title: key,
      description: `About ${key}`,
      startsAt: values.startsAt,
      endsAt: values.endsAt,
      status: values.status ?? "scheduled",
    })
    .returning();
  events[key] = row.id;
}

before(async () => {
  database = await createTestDatabase();
  const { db, schema } = database;
  const [admin] = await db.insert(schema.users).values({ email: "events-admin@example.test", passwordHash: "x", role: "admin" }).returning();
  adminId = admin.id;

  const hotelA = await insertHotel("Hotel A");
  const hotelB = await insertHotel("Hotel B");

  const spa = await insertPlace("Hotel A Spa", "business");
  await db.insert(schema.hotelFacilities).values({ hotelId: hotelA.id, placeId: spa.id, facilityType: "spa", status: "active" });
  const pool = await insertPlace("Hotel B Pool", "business");
  await db.insert(schema.hotelFacilities).values({ hotelId: hotelB.id, placeId: pool.id, facilityType: "pool", status: "active" });

  await insertPlace("Old Fortress", "attraction");
  await insertPlace("Contracted Cafe", "business");
  await contract("Contracted Cafe");
  await insertPlace("Uncontracted Bistro", "business");
  // Contract ends in the middle of its event: a guest at the end of it would be at a place no longer in the catalogue.
  await insertPlace("Ending Bar", "business");
  await contract("Ending Bar", { endsAt: at(DAY + HOUR) });
  // Contract starts after its event has begun.
  await insertPlace("Late Winery", "business");
  await contract("Late Winery", { startsAt: at(2 * DAY + HOUR) });
  // Contract ends exactly when its event ends: the half-open window still covers the event's last moment.
  await insertPlace("Exact Tavern", "business");
  await contract("Exact Tavern", { endsAt: at(3 * DAY + 2 * HOUR) });

  await guestAt("guest-a@example.test", "Hotel A");
  await guestAt("guest-b@example.test", "Hotel B");
  await guestAt("no-stay@example.test", null);

  const tomorrow = { startsAt: at(DAY), endsAt: at(DAY + 2 * HOUR) };
  await event("Spa evening", { hotel: "Hotel A", venue: "Hotel A Spa", ...tomorrow });
  await event("Fortress walk", { hotel: "Hotel A", venue: "Old Fortress", startsAt: at(2 * DAY), endsAt: at(2 * DAY + 2 * HOUR) });
  await event("Cafe tasting", { hotel: "Hotel A", venue: "Contracted Cafe", startsAt: at(3 * DAY), endsAt: at(3 * DAY + HOUR) });
  await event("Cafe cancelled", { hotel: "Hotel A", venue: "Contracted Cafe", ...tomorrow, status: "cancelled" });
  await event("Cafe yesterday", { hotel: "Hotel A", venue: "Contracted Cafe", startsAt: at(-DAY), endsAt: at(-DAY + HOUR) });
  await event("Cafe just ended", { hotel: "Hotel A", venue: "Contracted Cafe", startsAt: at(-HOUR), endsAt: NOW });
  await event("Cafe under way", { hotel: "Hotel A", venue: "Contracted Cafe", startsAt: at(-30 * MINUTE), endsAt: at(HOUR) });
  await event("Cafe just inside a week", { hotel: "Hotel A", venue: "Contracted Cafe", startsAt: at(7 * DAY - MINUTE), endsAt: at(7 * DAY + HOUR) });
  await event("Cafe in exactly a week", { hotel: "Hotel A", venue: "Contracted Cafe", startsAt: at(7 * DAY), endsAt: at(7 * DAY + HOUR) });
  await event("Cafe in eight days", { hotel: "Hotel A", venue: "Contracted Cafe", startsAt: at(8 * DAY), endsAt: at(8 * DAY + HOUR) });
  await event("Bar closing night", { hotel: "Hotel A", venue: "Ending Bar", ...tomorrow });
  await event("Winery opening", { hotel: "Hotel A", venue: "Late Winery", startsAt: at(2 * DAY), endsAt: at(2 * DAY + 2 * HOUR) });
  await event("Tavern last call", { hotel: "Hotel A", venue: "Exact Tavern", startsAt: at(3 * DAY + 30 * MINUTE), endsAt: at(3 * DAY + 2 * HOUR) });
  await event("Bistro supper", { hotel: "Hotel A", venue: "Uncontracted Bistro", ...tomorrow });
  // Saved against Hotel A at another hotel's facility (the admin action refuses this; the read must too).
  await event("Borrowed pool party", { hotel: "Hotel A", venue: "Hotel B Pool", ...tomorrow });
  // Hotel B's event at a venue BOTH hotels' guests can see: scoped by hotel, not by venue.
  await event("Hotel B cafe quiz", { hotel: "Hotel B", venue: "Contracted Cafe", ...tomorrow });
  await event("Hotel B pool night", { hotel: "Hotel B", venue: "Hotel B Pool", ...tomorrow });

  deps = {
    findActiveStayForUser: async (userId): Promise<GuestStay | null> => {
      const [row] = await db
        .select({
          id: schema.hotelStays.id,
          checkIn: schema.hotelStays.checkIn,
          checkOut: schema.hotelStays.checkOut,
          expectedCheckOut: schema.hotelStays.expectedCheckOut,
          hotel: schema.hotels,
          place: schema.places,
        })
        .from(schema.hotelStays)
        .innerJoin(schema.hotels, eq(schema.hotelStays.hotelId, schema.hotels.id))
        .innerJoin(schema.places, eq(schema.hotels.placeId, schema.places.id))
        .where(and(eq(schema.hotelStays.userId, userId), isNull(schema.hotelStays.checkOut)))
        .limit(1);
      return row ?? null;
    },
    listHotelEventsInWindow: (hotelId, window) => listHotelEventsInWindow(db, hotelId, window),
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

async function titlesFor(email: string) {
  const list = await listUpcomingHotelEventsForGuest({ userId: users[email] }, NOW, deps);
  return list.map((entry) => entry.title);
}

describe("a guest's hotel events (map and place list)", () => {
  it("returns exactly the own hotel's visible events, soonest first", async () => {
    assert.deepEqual(await titlesFor("guest-a@example.test"), [
      "Cafe under way",
      "Spa evening",
      "Fortress walk",
      "Cafe tasting",
      "Tavern last call",
      "Cafe just inside a week",
    ]);
  });

  it("includes the hotel's own facility, an attraction and a contracted business as venues", async () => {
    const list = await listUpcomingHotelEventsForGuest({ userId: users["guest-a@example.test"] }, NOW, deps);
    const venues = new Set(list.map((entry) => entry.venuePlaceId));
    for (const name of ["Hotel A Spa", "Old Fortress", "Contracted Cafe"]) assert.ok(venues.has(places[name]), name);
  });

  it("never returns another hotel's events, even at a venue both hotels' guests can see", async () => {
    const titles = await titlesFor("guest-a@example.test");
    assert.ok(!titles.includes("Hotel B cafe quiz"));
    assert.ok(!titles.includes("Hotel B pool night"));
    assert.deepEqual((await titlesFor("guest-b@example.test")).sort(), ["Hotel B cafe quiz", "Hotel B pool night"]);
  });

  it("excludes cancelled events", async () => {
    assert.ok(!(await titlesFor("guest-a@example.test")).includes("Cafe cancelled"));
  });

  it("excludes events that have ended, including one ending exactly now, and keeps one under way", async () => {
    const titles = await titlesFor("guest-a@example.test");
    assert.ok(!titles.includes("Cafe yesterday"));
    assert.ok(!titles.includes("Cafe just ended"));
    assert.ok(titles.includes("Cafe under way"));
  });

  it("excludes events starting 7 days from now or later", async () => {
    const titles = await titlesFor("guest-a@example.test");
    assert.ok(titles.includes("Cafe just inside a week"));
    assert.ok(!titles.includes("Cafe in exactly a week"));
    assert.ok(!titles.includes("Cafe in eight days"));
  });

  it("excludes an event whose venue is not eligible for the hotel at the event's own time", async () => {
    const titles = await titlesFor("guest-a@example.test");
    assert.ok(!titles.includes("Bistro supper"), "no Atlas contract");
    assert.ok(!titles.includes("Bar closing night"), "contract ends during the event");
    assert.ok(!titles.includes("Winery opening"), "contract starts after the event begins");
    assert.ok(!titles.includes("Borrowed pool party"), "another hotel's facility");
    assert.ok(titles.includes("Tavern last call"), "a contract ending exactly at the event's end still covers it");
  });

  it("returns nothing to a guest with no stay", async () => {
    assert.deepEqual(await titlesFor("no-stay@example.test"), []);
  });

  it("returns nothing once the guest's stay is past its dates", async () => {
    const later = new Date(NOW.getTime() + 20 * DAY);
    assert.deepEqual(await listUpcomingHotelEventsForGuest({ userId: users["guest-a@example.test"] }, later, deps), []);
  });

  it("gives the guest what, where and when, and nothing about capacity or booking", async () => {
    const [first] = await listUpcomingHotelEventsForGuest({ userId: users["guest-a@example.test"] }, NOW, deps);
    assert.deepEqual(Object.keys(first).sort(), ["description", "endsAt", "id", "startsAt", "title", "venuePlaceId"]);
    assert.equal(first.id, events["Cafe under way"]);
  });
});
