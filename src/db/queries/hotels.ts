import "server-only";
import { and, count, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { hotelFacilities, hotelPartnerships, hotels, places, qrCredentials } from "@/db/schema";

export async function listHotelsWithPlace() {
  return db
    .select({
      id: hotels.id,
      placeId: hotels.placeId,
      createdAt: hotels.createdAt,
      updatedAt: hotels.updatedAt,
      place: places,
      // Presence of a live entry credential, for the admin list. Never the
      // credential: only a hash of it exists, and only in qr_credentials.
      entryCredentialIssuedAt: qrCredentials.createdAt,
    })
    .from(hotels)
    .innerJoin(places, eq(hotels.placeId, places.id))
    .leftJoin(
      qrCredentials,
      and(eq(qrCredentials.hotelId, hotels.id), isNull(qrCredentials.revokedAt))
    )
    .orderBy(places.name);
}
export type HotelWithPlace = Awaited<ReturnType<typeof listHotelsWithPlace>>[number];

/*
 * findHotelByQrToken is deliberately gone: a hotel is no longer resolved by
 * comparing a raw column value. Hotel entry resolves a hashed, purpose-bound
 * credential (services/qr + db/queries/qr-credentials) and then loads the hotel
 * by the id stored on that credential.
 */

export async function findHotelById(id: string) {
  const [row] = await db
    .select({
      id: hotels.id,
      placeId: hotels.placeId,
      createdAt: hotels.createdAt,
      updatedAt: hotels.updatedAt,
      place: places,
    })
    .from(hotels)
    .innerJoin(places, eq(hotels.placeId, places.id))
    .where(eq(hotels.id, id))
    .limit(1);
  return row ?? null;
}

/** No QR token here: a new hotel starts with no entry credential, and an admin issues one explicitly (see features/qr-credentials/actions.ts). */
export async function createHotel(input: { placeId: string }) {
  const [hotel] = await db.insert(hotels).values(input).returning();
  return hotel;
}

export async function updateHotelPlace(id: string, placeId: string) {
  const [hotel] = await db
    .update(hotels)
    .set({ placeId, updatedAt: new Date() })
    .where(eq(hotels.id, id))
    .returning();
  return hotel ?? null;
}

export async function deleteHotel(id: string) {
  await db.delete(hotels).where(eq(hotels.id, id));
}

/*
 * Deletion safety. The logic lives in db/operations/hotel-deletion.ts so the
 * PGlite tests call the real counting code; this only binds the production handle.
 */
export async function countHotelDeletionBlockers(hotelId: string) {
  const { countHotelDeletionBlockers: operation } = await import("@/db/operations/hotel-deletion");
  return operation(db, hotelId);
}

/**
 * The admin Hotels list (Figma AdminHotels 70:811): each hotel with its anchor Place and how many
 * active facilities and currently active partnerships it has. "Currently active" is the same test
 * the guest side applies — status active and `now` inside the optional window — so the number an
 * admin reads is the number of partners a guest of that hotel can actually be shown (before the
 * Place's own publication and verification checks).
 */
export async function listHotelsForAdminOverview(now: Date) {
  const facilityCount = db
    .select({ hotelId: hotelFacilities.hotelId, n: count().as("facility_n") })
    .from(hotelFacilities)
    .where(eq(hotelFacilities.status, "active"))
    .groupBy(hotelFacilities.hotelId)
    .as("facility_counts");
  const partnerCount = db
    .select({ hotelId: hotelPartnerships.hotelId, n: count().as("partner_n") })
    .from(hotelPartnerships)
    .where(
      and(
        eq(hotelPartnerships.status, "active"),
        or(isNull(hotelPartnerships.startsAt), lte(hotelPartnerships.startsAt, now)),
        or(isNull(hotelPartnerships.endsAt), gt(hotelPartnerships.endsAt, now))
      )
    )
    .groupBy(hotelPartnerships.hotelId)
    .as("partner_counts");

  return db
    .select({
      id: hotels.id,
      name: places.name,
      address: places.address,
      archivedAt: places.archivedAt,
      publicationStatus: places.publicationStatus,
      facilities: sql<number>`coalesce(${facilityCount.n}, 0)`.mapWith(Number),
      activePartners: sql<number>`coalesce(${partnerCount.n}, 0)`.mapWith(Number),
    })
    .from(hotels)
    .innerJoin(places, eq(hotels.placeId, places.id))
    .leftJoin(facilityCount, eq(facilityCount.hotelId, hotels.id))
    .leftJoin(partnerCount, eq(partnerCount.hotelId, hotels.id))
    .orderBy(places.name);
}
