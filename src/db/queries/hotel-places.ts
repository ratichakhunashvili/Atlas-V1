import "server-only";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { hotelPlaces, places } from "@/db/schema";

/** The Places currently assigned to a hotel (its partners/priority locations), highest priority first, then most recently assigned. */
export async function listPlacesForHotel(hotelId: string) {
  const rows = await db
    .select({
      hotelId: hotelPlaces.hotelId,
      placeId: hotelPlaces.placeId,
      priority: hotelPlaces.priority,
      createdAt: hotelPlaces.createdAt,
      place: places,
    })
    .from(hotelPlaces)
    .innerJoin(places, eq(hotelPlaces.placeId, places.id))
    .where(eq(hotelPlaces.hotelId, hotelId));

  return rows.sort((a, b) => {
    if (a.priority !== b.priority) {
      if (a.priority === null) return 1;
      if (b.priority === null) return -1;
      return a.priority - b.priority;
    }
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

export async function assignPlaceToHotel(hotelId: string, placeId: string, priority?: number | null) {
  const [row] = await db
    .insert(hotelPlaces)
    .values({ hotelId, placeId, priority: priority ?? null })
    .onConflictDoUpdate({
      target: [hotelPlaces.hotelId, hotelPlaces.placeId],
      set: { priority: priority ?? null },
    })
    .returning();
  return row;
}

export async function unassignPlaceFromHotel(hotelId: string, placeId: string) {
  await db.delete(hotelPlaces).where(and(eq(hotelPlaces.hotelId, hotelId), eq(hotelPlaces.placeId, placeId)));
}
