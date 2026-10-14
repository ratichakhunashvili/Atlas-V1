import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { PG_UNIQUE_VIOLATION, hasPgErrorCode } from "@/db/errors";
import { hotelPartnerships, places, type HotelPartnership, type PartnershipStatus } from "@/db/schema";
import type { PartnershipRow } from "@/services/eligibility/rules";

const PARTNERSHIP_ROW_COLUMNS = {
  id: hotelPartnerships.id,
  hotelId: hotelPartnerships.hotelId,
  placeId: hotelPartnerships.placeId,
  status: hotelPartnerships.status,
  startsAt: hotelPartnerships.startsAt,
  endsAt: hotelPartnerships.endsAt,
  confirmedAt: hotelPartnerships.confirmedAt,
  priority: hotelPartnerships.priority,
  place: places,
} as const;

/**
 * Every partnership row (ALL statuses) for ONE hotel, with its Place. The
 * eligibility rules (services/eligibility/rules.ts) — not this query — decide
 * which rows are eligible, so "what counts as eligible" has one definition.
 * Always scoped by hotelId; there is deliberately no cross-hotel variant for
 * guest code.
 */
export async function listPartnershipRowsForHotel(hotelId: string): Promise<PartnershipRow[]> {
  return db
    .select(PARTNERSHIP_ROW_COLUMNS)
    .from(hotelPartnerships)
    .innerJoin(places, eq(hotelPartnerships.placeId, places.id))
    .where(eq(hotelPartnerships.hotelId, hotelId));
}

/** Admin listing: full rows incl. confirmation metadata, newest first. */
export async function listPartnershipsForAdmin(hotelId: string) {
  return db
    .select({ partnership: hotelPartnerships, place: places })
    .from(hotelPartnerships)
    .innerJoin(places, eq(hotelPartnerships.placeId, places.id))
    .where(eq(hotelPartnerships.hotelId, hotelId))
    .orderBy(desc(hotelPartnerships.createdAt));
}
export type AdminPartnershipRow = Awaited<ReturnType<typeof listPartnershipsForAdmin>>[number];

export async function findPartnershipById(id: string): Promise<HotelPartnership | null> {
  const [row] = await db.select().from(hotelPartnerships).where(eq(hotelPartnerships.id, id)).limit(1);
  return row ?? null;
}

/** New relationships always start `pending_review` — never active. Returns null if this hotel/Place pair already has a row. */
export async function createPendingPartnership(input: { hotelId: string; placeId: string }): Promise<HotelPartnership | null> {
  try {
    const [row] = await db
      .insert(hotelPartnerships)
      .values({ hotelId: input.hotelId, placeId: input.placeId, status: "pending_review" })
      .returning();
    return row;
  } catch (error) {
    if (hasPgErrorCode(error, PG_UNIQUE_VIOLATION)) return null;
    throw error;
  }
}

type TransitionPatch = Partial<
  Pick<
    typeof hotelPartnerships.$inferInsert,
    "status" | "startsAt" | "endsAt" | "priority" | "confirmedBy" | "confirmedAt" | "revokedAt"
  >
>;

/**
 * Compare-and-set: only updates if the row is still in one of `fromStatuses`,
 * so two concurrent admin actions can't both "win". Returns null if the row
 * no longer matches (already changed, or doesn't exist).
 */
export async function transitionPartnership(
  id: string,
  fromStatuses: readonly PartnershipStatus[],
  patch: TransitionPatch
): Promise<HotelPartnership | null> {
  const [row] = await db
    .update(hotelPartnerships)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(hotelPartnerships.id, id), inArray(hotelPartnerships.status, [...fromStatuses])))
    .returning();
  return row ?? null;
}

/** True if ANY hotel has a partnership row (any status) for this Place — such a Place is an external business, so it can't also be registered as a hotel-owned facility. */
export async function placeHasPartnershipRows(placeId: string): Promise<boolean> {
  const [row] = await db.select({ id: hotelPartnerships.id }).from(hotelPartnerships).where(eq(hotelPartnerships.placeId, placeId)).limit(1);
  return row !== undefined;
}
