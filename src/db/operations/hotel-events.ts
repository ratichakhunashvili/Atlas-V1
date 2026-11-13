import { and, asc, eq, gt, lt } from "drizzle-orm";
import { hotelEvents, type HotelEvent } from "@/db/schema";
import type { AtlasDatabase } from "./types";

/**
 * One hotel's scheduled events that a guest could still go to: not cancelled, not yet over (an event already under
 * way still counts), and starting before `startsBefore`. Soonest first.
 *
 * Scoped to ONE hotel by argument; the guest read in services/eligibility passes the hotel of the guest's own valid
 * stay, never a request value. It decides nothing about the venue: services/eligibility checks that each venue is in
 * the hotel's catalogue at the event's own time. It reads no Place.
 */
export async function listHotelEventsInWindow(
  db: AtlasDatabase,
  hotelId: string,
  window: { endsAfter: Date; startsBefore: Date }
): Promise<HotelEvent[]> {
  return db
    .select()
    .from(hotelEvents)
    .where(
      and(
        eq(hotelEvents.hotelId, hotelId),
        eq(hotelEvents.status, "scheduled"),
        gt(hotelEvents.endsAt, window.endsAfter),
        lt(hotelEvents.startsAt, window.startsBefore)
      )
    )
    .orderBy(asc(hotelEvents.startsAt), asc(hotelEvents.id));
}
