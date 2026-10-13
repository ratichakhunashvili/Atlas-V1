import "server-only";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { hotelStays, hotels, places } from "@/db/schema";

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

/**
 * Drizzle wraps the real postgres error in a DrizzleQueryError — the actual
 * SQLSTATE lives at `error.cause.code`, not `error.code` directly (confirmed
 * against the real Neon DB; both the raw-execute and query-builder paths,
 * inside or outside a transaction, wrap the same way). Checking `error.code`
 * alone — as this function originally did — always returns false, so a
 * concurrent check-in would throw instead of gracefully resolving to the
 * stay that won the race.
 */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "23505") return true;
  const cause = (error as { cause?: unknown }).cause;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}

/** Returns null (instead of throwing) if hotel_stays_active_user_idx rejects this insert — i.e. a concurrent request already created an active stay for this user first. Callers should re-look-up the active stay in that case rather than treat it as a hard failure. */
export async function createHotelStay(input: {
  userId: string;
  hotelId: string;
  checkIn: Date;
  checkOut?: Date | null;
}) {
  try {
    const [stay] = await db.insert(hotelStays).values(input).returning();
    return stay;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}
