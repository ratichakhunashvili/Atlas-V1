import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { hotelStays, hotels, places } from "@/db/schema";
import {
  createHotelStay as createHotelStayOperation,
  switchActiveStay as switchActiveStayOperation,
  stayHasItineraryDays as stayHasItineraryDaysOperation,
  updateStayDates as updateStayDatesOperation,
} from "@/db/operations/hotel-stays";

/** The stay enforced unique by hotel_stays_active_user_idx — checkOut still null. Used by the check-in action to detect an existing active stay before inserting a new one. */
export async function findActiveStayForUser(userId: string) {
  const [row] = await db
    .select({
      id: hotelStays.id,
      checkIn: hotelStays.checkIn,
      // Always null given the WHERE clause below — selected anyway so callers
      // (e.g. the Advisor's day-number calculation) can read it from this row
      // rather than assuming null, staying correct if "active" is ever redefined.
      checkOut: hotelStays.checkOut,
      expectedCheckOut: hotelStays.expectedCheckOut,
      datesSource: hotelStays.datesSource,
      hotel: hotels,
      place: places,
    })
    .from(hotelStays)
    .innerJoin(hotels, eq(hotelStays.hotelId, hotels.id))
    .innerJoin(places, eq(hotels.placeId, places.id))
    .where(and(eq(hotelStays.userId, userId), isNull(hotelStays.checkOut)))
    .limit(1);
  return row ?? null;
}

export async function findCurrentStayForUser(userId: string) {
  const [row] = await db
    .select({
      id: hotelStays.id,
      checkIn: hotelStays.checkIn,
      checkOut: hotelStays.checkOut,
      expectedCheckOut: hotelStays.expectedCheckOut,
      datesSource: hotelStays.datesSource,
      hotel: hotels,
      place: places,
    })
    .from(hotelStays)
    .innerJoin(hotels, eq(hotelStays.hotelId, hotels.id))
    .innerJoin(places, eq(hotels.placeId, places.id))
    .where(eq(hotelStays.userId, userId))
    .orderBy(desc(hotelStays.checkIn))
    .limit(1);
  return row ?? null;
}

/*
 * The write operations live in db/operations/hotel-stays.ts, which takes the
 * database handle as an argument and imports neither `@/db` nor `server-only`.
 * That is what lets the PGlite tests call the REAL operation against an in-memory
 * Postgres instead of re-implementing its SQL and drifting from it. The wrappers
 * below exist only to bind the production singleton, and hold no logic of their own.
 */

export async function switchActiveStay(input: { userId: string; toHotelId: string; now: Date }) {
  return switchActiveStayOperation(db, input);
}

export async function createHotelStay(input: {
  userId: string;
  hotelId: string;
  checkIn: Date;
  checkOut?: Date | null;
}) {
  return createHotelStayOperation(db, input);
}

export async function stayHasItineraryDays(input: { userId: string; hotelId: string }) {
  return stayHasItineraryDaysOperation(db, input);
}

export async function updateStayDates(input: { userId: string; stayId: string; checkIn: Date; expectedCheckOut: Date }) {
  return updateStayDatesOperation(db, input);
}
