import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { PG_UNIQUE_VIOLATION, hasPgErrorCode } from "@/db/errors";
import { hotelFacilities, places, type FacilityStatus, type FacilityType, type HotelFacility } from "@/db/schema";
import type { FacilityRow } from "@/services/eligibility/rules";

/** Every facility row (all statuses) owned by ONE hotel, with its Place — rules.ts decides eligibility. */
export async function listFacilityRowsForHotel(hotelId: string): Promise<FacilityRow[]> {
  return db
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

export async function listFacilitiesForAdmin(hotelId: string) {
  return db
    .select({ facility: hotelFacilities, place: places })
    .from(hotelFacilities)
    .innerJoin(places, eq(hotelFacilities.placeId, places.id))
    .where(eq(hotelFacilities.hotelId, hotelId))
    .orderBy(desc(hotelFacilities.createdAt));
}
export type AdminFacilityRow = Awaited<ReturnType<typeof listFacilitiesForAdmin>>[number];

export async function findFacilityById(id: string): Promise<HotelFacility | null> {
  const [row] = await db.select().from(hotelFacilities).where(eq(hotelFacilities.id, id)).limit(1);
  return row ?? null;
}

/** The hotel that owns this Place as a facility, if any (a Place is a facility of at most one hotel). */
export async function findFacilityByPlaceId(placeId: string): Promise<HotelFacility | null> {
  const [row] = await db.select().from(hotelFacilities).where(eq(hotelFacilities.placeId, placeId)).limit(1);
  return row ?? null;
}

/** Returns null if this Place is already some hotel's facility. */
export async function createFacility(input: {
  hotelId: string;
  placeId: string;
  facilityType: FacilityType;
}): Promise<HotelFacility | null> {
  try {
    const [row] = await db.insert(hotelFacilities).values({ ...input, status: "active" }).returning();
    return row;
  } catch (error) {
    if (hasPgErrorCode(error, PG_UNIQUE_VIOLATION)) return null;
    throw error;
  }
}

export async function setFacilityStatus(id: string, status: FacilityStatus): Promise<HotelFacility | null> {
  const [row] = await db
    .update(hotelFacilities)
    .set({ status, updatedAt: new Date() })
    .where(eq(hotelFacilities.id, id))
    .returning();
  return row ?? null;
}
