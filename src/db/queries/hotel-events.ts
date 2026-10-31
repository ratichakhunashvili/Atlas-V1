import "server-only";
import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { hotelEvents, places, type HotelEvent } from "@/db/schema";

/**
 * One hotel's upcoming events, soonest first.
 *
 * Scoped to a single hotel by argument, and that argument always comes from the
 * guest's own active stay — never from a request. Cancelled events are excluded
 * here as well as in the Advisor's own rule, because nothing downstream should
 * have to remember to.
 */
export async function listUpcomingHotelEvents(hotelId: string, from: Date): Promise<HotelEvent[]> {
  return db
    .select()
    .from(hotelEvents)
    .where(
      and(
        eq(hotelEvents.hotelId, hotelId),
        eq(hotelEvents.status, "scheduled"),
        // Still to come: an event already under way is not something to send a guest to.
        gte(hotelEvents.startsAt, from)
      )
    )
    .orderBy(asc(hotelEvents.startsAt));
}

/** Admin listing: every event for a hotel, with its venue's name, newest schedule first. */
export async function listHotelEventsWithVenue(hotelId: string) {
  return db
    .select({
      id: hotelEvents.id,
      hotelId: hotelEvents.hotelId,
      venuePlaceId: hotelEvents.venuePlaceId,
      title: hotelEvents.title,
      description: hotelEvents.description,
      startsAt: hotelEvents.startsAt,
      endsAt: hotelEvents.endsAt,
      status: hotelEvents.status,
      venueName: places.name,
    })
    .from(hotelEvents)
    .innerJoin(places, eq(hotelEvents.venuePlaceId, places.id))
    .where(eq(hotelEvents.hotelId, hotelId))
    .orderBy(asc(hotelEvents.startsAt));
}

export type HotelEventWithVenue = Awaited<ReturnType<typeof listHotelEventsWithVenue>>[number];

export async function createHotelEvent(input: {
  hotelId: string;
  venuePlaceId: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
}): Promise<HotelEvent> {
  const [created] = await db.insert(hotelEvents).values(input).returning();
  return created;
}

/**
 * Cancels an event rather than deleting it: a guest may already have it in a saved
 * plan, and that plan is history. Scoped by hotel so one hotel's admin action can
 * never reach another hotel's event.
 */
export async function cancelHotelEvent(eventId: string, hotelId: string): Promise<HotelEvent | null> {
  const [updated] = await db
    .update(hotelEvents)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(and(eq(hotelEvents.id, eventId), eq(hotelEvents.hotelId, hotelId)))
    .returning();
  return updated ?? null;
}
