import { and, count, eq } from "drizzle-orm";
import {
  hotelEvents,
  hotelFacilities,
  hotelPartnerships,
  hotelStays,
  itineraryDays,
  qrCredentials,
} from "@/db/schema";
import type { AtlasDatabase } from "./types";

/**
 * What a hotel would take with it.
 *
 * Deleting a hotel used to cascade straight through `hotel_stays` and
 * `itinerary_days` — so removing a hotel that a guest had ever stayed at silently
 * erased that guest's stay and every itinerary and completed stop inside it. The
 * admin saw a row disappear; what actually went was somebody's history.
 *
 * Counted separately because the two groups mean different things:
 *
 *  - GUEST history (stays, itinerary days) is not the hotel's to delete. Migration
 *    0009 makes the database refuse it outright; this count is what lets the UI
 *    explain why instead of surfacing a constraint error.
 *  - The hotel's OWN records (partnerships, facilities, events, credentials) are
 *    administrative. They still block a casual delete, because losing the audit
 *    trail of who was approved and when is a real loss, but they are the hotel's
 *    own data rather than a guest's.
 */
export type HotelDeletionBlockers = {
  stays: number;
  itineraryDays: number;
  partnerships: number;
  facilities: number;
  events: number;
  qrCredentials: number;
};

export async function countHotelDeletionBlockers(
  db: AtlasDatabase,
  hotelId: string
): Promise<HotelDeletionBlockers> {
  const [stays] = await db.select({ value: count() }).from(hotelStays).where(eq(hotelStays.hotelId, hotelId));
  const [days] = await db.select({ value: count() }).from(itineraryDays).where(eq(itineraryDays.hotelId, hotelId));
  const [partnerships] = await db
    .select({ value: count() })
    .from(hotelPartnerships)
    .where(eq(hotelPartnerships.hotelId, hotelId));
  const [facilities] = await db
    .select({ value: count() })
    .from(hotelFacilities)
    .where(eq(hotelFacilities.hotelId, hotelId));
  const [events] = await db.select({ value: count() }).from(hotelEvents).where(eq(hotelEvents.hotelId, hotelId));
  const [credentials] = await db
    .select({ value: count() })
    .from(qrCredentials)
    .where(and(eq(qrCredentials.hotelId, hotelId)));

  return {
    stays: stays?.value ?? 0,
    itineraryDays: days?.value ?? 0,
    partnerships: partnerships?.value ?? 0,
    facilities: facilities?.value ?? 0,
    events: events?.value ?? 0,
    qrCredentials: credentials?.value ?? 0,
  };
}

/** True when anything at all would be destroyed or orphaned by deleting this hotel. */
export function hasHotelDeletionBlockers(blockers: HotelDeletionBlockers): boolean {
  return Object.values(blockers).some((value) => value > 0);
}

/** True when GUEST history would go — the part that is never the hotel's to delete. */
export function blocksOnGuestHistory(blockers: HotelDeletionBlockers): boolean {
  return blockers.stays > 0 || blockers.itineraryDays > 0;
}

/** Plain-language explanation for the admin, naming what is actually in the way. */
export function hotelDeletionBlockedMessage(blockers: HotelDeletionBlockers): string {
  const parts: string[] = [];
  if (blockers.stays > 0) parts.push(`${blockers.stays} guest stay${blockers.stays === 1 ? "" : "s"}`);
  if (blockers.itineraryDays > 0) {
    parts.push(`${blockers.itineraryDays} itinerar${blockers.itineraryDays === 1 ? "y" : "ies"}`);
  }
  if (blockers.partnerships > 0) parts.push(`${blockers.partnerships} partnership record(s)`);
  if (blockers.facilities > 0) parts.push(`${blockers.facilities} facility record(s)`);
  if (blockers.events > 0) parts.push(`${blockers.events} event(s)`);
  if (blockers.qrCredentials > 0) parts.push(`${blockers.qrCredentials} QR credential(s)`);

  return `This hotel can't be deleted: it has ${parts.join(", ")}. Guest stays and itineraries are history and are never removed with a hotel.`;
}
