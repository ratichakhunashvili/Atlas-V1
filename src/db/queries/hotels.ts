import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { hotels, places } from "@/db/schema";

export async function listHotelsWithPlace() {
  return db
    .select({
      id: hotels.id,
      placeId: hotels.placeId,
      qrToken: hotels.qrToken,
      createdAt: hotels.createdAt,
      updatedAt: hotels.updatedAt,
      place: places,
    })
    .from(hotels)
    .innerJoin(places, eq(hotels.placeId, places.id))
    .orderBy(places.name);
}
export type HotelWithPlace = Awaited<ReturnType<typeof listHotelsWithPlace>>[number];

export async function findHotelByQrToken(qrToken: string) {
  const [row] = await db
    .select({
      id: hotels.id,
      placeId: hotels.placeId,
      qrToken: hotels.qrToken,
      createdAt: hotels.createdAt,
      updatedAt: hotels.updatedAt,
      place: places,
    })
    .from(hotels)
    .innerJoin(places, eq(hotels.placeId, places.id))
    .where(eq(hotels.qrToken, qrToken))
    .limit(1);
  return row ?? null;
}

export async function findHotelById(id: string) {
  const [row] = await db
    .select({
      id: hotels.id,
      placeId: hotels.placeId,
      qrToken: hotels.qrToken,
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

export async function createHotel(input: { placeId: string; qrToken: string }) {
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
