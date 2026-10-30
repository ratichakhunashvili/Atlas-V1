import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { hotels, places, qrCredentials } from "@/db/schema";

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
