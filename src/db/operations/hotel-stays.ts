import { and, eq, isNull } from "drizzle-orm";
import { hotelStays, itineraryDays } from "@/db/schema";
import type { AtlasDatabase } from "./types";

/**
 * Drizzle wraps the real postgres error in a DrizzleQueryError — the actual
 * SQLSTATE lives at `error.cause.code`, not `error.code` directly. Checking
 * `error.code` alone always returns false, so a concurrent request would throw
 * instead of gracefully resolving to the row that won the race.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "23505") return true;
  const cause = (error as { cause?: unknown }).cause;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}

/**
 * Closes the guest's current stay and opens one at the scanned hotel, in a single
 * transaction — so the one-active-stay invariant (hotel_stays_active_user_idx) is
 * never briefly violated, and a failure part-way leaves the guest with their
 * original stay rather than none at all. The closed stay keeps its history: only
 * `check_out` is set.
 *
 * Returns null if a concurrent request got there first; the caller re-reads the
 * stay that won rather than treating it as an error.
 */
export async function switchActiveStay(
  db: AtlasDatabase,
  input: { userId: string; toHotelId: string; now: Date }
) {
  try {
    return await db.transaction(async (tx) => {
      await tx
        .update(hotelStays)
        .set({ checkOut: input.now })
        .where(and(eq(hotelStays.userId, input.userId), isNull(hotelStays.checkOut)));

      const [stay] = await tx
        .insert(hotelStays)
        .values({ userId: input.userId, hotelId: input.toHotelId, checkIn: input.now })
        .returning();

      return stay;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

/** Returns null (instead of throwing) if hotel_stays_active_user_idx rejects this insert — i.e. a concurrent request already created an active stay for this user first. */
export async function createHotelStay(
  db: AtlasDatabase,
  input: { userId: string; hotelId: string; checkIn: Date; checkOut?: Date | null }
) {
  try {
    const [stay] = await db.insert(hotelStays).values(input).returning();
    return stay;
  } catch (error) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
}

/**
 * True once this guest has any itinerary day at this stay's hotel. Plans are numbered by day of stay (counted from
 * check-in), so moving the arrival date afterwards would silently renumber — and mis-associate — existing days.
 */
export async function stayHasItineraryDays(db: AtlasDatabase, input: { userId: string; hotelId: string }) {
  const [row] = await db
    .select({ id: itineraryDays.id })
    .from(itineraryDays)
    .where(and(eq(itineraryDays.userId, input.userId), eq(itineraryDays.hotelId, input.hotelId)))
    .limit(1);
  return row !== undefined;
}

/**
 * Stores the guest's declared dates on THEIR OWN active stay. The WHERE carries every guard, so a stale or forged
 * request writes nothing: owned by this user, still active, and still guest-declared — dates a verified source
 * supplied are never overwritten by a guest's edit. Returns null when no row matched.
 */
export async function updateStayDates(
  db: AtlasDatabase,
  input: { userId: string; stayId: string; checkIn: Date; expectedCheckOut: Date }
) {
  const [stay] = await db
    .update(hotelStays)
    .set({ checkIn: input.checkIn, expectedCheckOut: input.expectedCheckOut, datesSource: "guest_declared" })
    .where(
      and(
        eq(hotelStays.id, input.stayId),
        eq(hotelStays.userId, input.userId),
        isNull(hotelStays.checkOut),
        eq(hotelStays.datesSource, "guest_declared")
      )
    )
    .returning();
  return stay ?? null;
}
