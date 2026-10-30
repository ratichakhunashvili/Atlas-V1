import { and, eq, gte } from "drizzle-orm";
import { hotels, pendingHotelSwitches, places } from "@/db/schema";
import type { AtlasDatabase } from "./types";

/**
 * How long a guest has to answer "switch hotels?" before the scan has to be
 * repeated. Long enough to read the question and think, short enough that a
 * stale intent cannot be confirmed later from a reopened tab.
 */
export const PENDING_SWITCH_TTL_MS = 10 * 60 * 1000;

/**
 * Records that this guest scanned that hotel's entry credential. Written only
 * after the credential has been verified server-side.
 *
 * One pending switch per guest: a second scan replaces the first, so the answer
 * always applies to the most recent question.
 */
export async function recordPendingHotelSwitch(
  db: AtlasDatabase,
  input: { userId: string; hotelId: string; now: Date }
) {
  const expiresAt = new Date(input.now.getTime() + PENDING_SWITCH_TTL_MS);

  const [row] = await db
    .insert(pendingHotelSwitches)
    .values({ userId: input.userId, hotelId: input.hotelId, createdAt: input.now, expiresAt })
    .onConflictDoUpdate({
      target: pendingHotelSwitches.userId,
      set: { hotelId: input.hotelId, createdAt: input.now, expiresAt },
    })
    .returning();

  return row;
}

/**
 * The guest's live pending switch, with the hotel's name for the confirmation
 * screen. Expiry is part of the WHERE clause, so an expired row can never be
 * read as valid — its presence is not enough.
 */
export async function findPendingHotelSwitch(db: AtlasDatabase, userId: string, now: Date) {
  const [row] = await db
    .select({
      userId: pendingHotelSwitches.userId,
      hotelId: pendingHotelSwitches.hotelId,
      expiresAt: pendingHotelSwitches.expiresAt,
      hotelName: places.name,
    })
    .from(pendingHotelSwitches)
    .innerJoin(hotels, eq(pendingHotelSwitches.hotelId, hotels.id))
    .innerJoin(places, eq(hotels.placeId, places.id))
    .where(and(eq(pendingHotelSwitches.userId, userId), gte(pendingHotelSwitches.expiresAt, now)))
    .limit(1);

  return row ?? null;
}

/** Removes the pending switch once it has been confirmed, declined, or superseded. Safe to call when there is none. */
export async function clearPendingHotelSwitch(db: AtlasDatabase, userId: string) {
  await db.delete(pendingHotelSwitches).where(eq(pendingHotelSwitches.userId, userId));
}
