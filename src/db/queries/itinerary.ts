import "server-only";
import { and, asc, desc, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  itineraryDays,
  itineraryStops,
  type CheckInMethod,
  type ItineraryDay,
  type ItineraryStop,
  type PlaceCategory,
} from "@/db/schema";

export async function findItineraryDay(userId: string, hotelId: string, dayNumber: number) {
  const [row] = await db
    .select()
    .from(itineraryDays)
    .where(and(eq(itineraryDays.userId, userId), eq(itineraryDays.hotelId, hotelId), eq(itineraryDays.dayNumber, dayNumber)))
    .limit(1);
  return row ?? null;
}

/** The most recent day strictly before `beforeDayNumber` — "the previous day" for the difficulty ratchet, regardless of gaps left by skipped calendar days. */
export async function findLatestItineraryDayBefore(userId: string, hotelId: string, beforeDayNumber: number) {
  const [row] = await db
    .select()
    .from(itineraryDays)
    .where(
      and(eq(itineraryDays.userId, userId), eq(itineraryDays.hotelId, hotelId), lt(itineraryDays.dayNumber, beforeDayNumber))
    )
    .orderBy(desc(itineraryDays.dayNumber))
    .limit(1);
  return row ?? null;
}

export async function listItineraryStops(dayId: string) {
  return db.select().from(itineraryStops).where(eq(itineraryStops.dayId, dayId)).orderBy(asc(itineraryStops.position));
}

/** A stop plus its parent day — the day carries `userId`, the source of truth for ownership (a stop never trusts a client-supplied hotelId/userId). Null if the stop doesn't exist. */
export async function findItineraryStopWithDay(stopId: string): Promise<{ stop: ItineraryStop; day: ItineraryDay } | null> {
  const [row] = await db
    .select({ stop: itineraryStops, day: itineraryDays })
    .from(itineraryStops)
    .innerJoin(itineraryDays, eq(itineraryDays.id, itineraryStops.dayId))
    .where(eq(itineraryStops.id, stopId))
    .limit(1);
  return row ?? null;
}

/**
 * Conditionally marks one stop visited (via whichever method the caller
 * verified — GPS or QR), then marks its day completed if every stop is now
 * visited — both inside one transaction. Returns null if the stop was
 * already visited: the `WHERE visited_at IS NULL` guard on the UPDATE is
 * what makes two simultaneous requests for the SAME stop resolve to exactly
 * one real transition (Postgres row-locks the UPDATE; the loser's WHERE
 * clause simply no longer matches once the winner commits) — no second
 * table, no explicit advisory lock needed. Shared by GPS and QR check-in so
 * the transaction/concurrency/completion logic exists exactly once.
 */
export async function markStopVisited(
  stopId: string,
  dayId: string,
  checkInMethod: CheckInMethod
): Promise<{ stop: ItineraryStop; dayCompleted: boolean } | null> {
  return db.transaction(async (tx) => {
    const [updatedStop] = await tx
      .update(itineraryStops)
      .set({ visitedAt: new Date(), checkInMethod })
      .where(and(eq(itineraryStops.id, stopId), isNull(itineraryStops.visitedAt)))
      .returning();

    if (!updatedStop) return null;

    const remaining = await tx
      .select({ id: itineraryStops.id })
      .from(itineraryStops)
      .where(and(eq(itineraryStops.dayId, dayId), isNull(itineraryStops.visitedAt)))
      .limit(1);

    const dayCompleted = remaining.length === 0;
    if (dayCompleted) {
      await tx
        .update(itineraryDays)
        .set({ completedAt: new Date() })
        .where(and(eq(itineraryDays.id, dayId), isNull(itineraryDays.completedAt)));
    }

    return { stop: updatedStop, dayCompleted };
  });
}

/** Place id -> the most recent itinerary dayNumber it appeared in, for this guest at this hotel — scoring.ts's UsageHistory input. Stops whose Place has since been deleted (placeId null) can't be tracked for freshness and are excluded. */
export async function getStopUsageHistory(userId: string, hotelId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      placeId: itineraryStops.placeId,
      dayNumber: itineraryDays.dayNumber,
    })
    .from(itineraryStops)
    .innerJoin(itineraryDays, eq(itineraryDays.id, itineraryStops.dayId))
    .where(and(eq(itineraryDays.userId, userId), eq(itineraryDays.hotelId, hotelId)));

  const history = new Map<string, number>();
  for (const row of rows) {
    if (!row.placeId) continue;
    const existing = history.get(row.placeId);
    if (existing === undefined || row.dayNumber > existing) {
      history.set(row.placeId, row.dayNumber);
    }
  }
  return history;
}

/**
 * Drizzle wraps the real postgres error in a DrizzleQueryError — the actual
 * SQLSTATE lives at `error.cause.code` (confirmed against the real Neon DB;
 * see the matching note in db/queries/hotel-stays.ts, where the same check
 * originally looked at the wrong property and never actually fired).
 */
function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "23505") return true;
  const cause = (error as { cause?: unknown }).cause;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === "23505";
}

export type PersistStopInput = {
  placeId: string | null;
  isHotelStop: boolean;
  checkInMethod: CheckInMethod;
  name: string;
  category: PlaceCategory | null;
  latitude: number;
  longitude: number;
  imageUrl: string | null;
  /** Non-null for a stop that's auto-completed at generation time (the hotel filler) — null for every normal stop, which starts unvisited regardless of check-in method. */
  visitedAt: Date | null;
};

export type PersistItineraryInput = {
  userId: string;
  hotelId: string;
  hotelStayId: string;
  dayNumber: number;
  /** Non-null rebuilds this existing row in place (cooldown expired); null inserts a new row. */
  existingDayId: string | null;
  routeGeoJson: unknown;
  totalDurationSeconds: number;
  generatedAt: Date;
  /** Non-null only when every stop is already visited at generation time (e.g. the itinerary is just the auto-visited hotel filler) — matches the same "all stops visited" rule markStopVisitedViaGps applies after a GPS check-in. */
  completedAt: Date | null;
  stops: PersistStopInput[];
};

export type PersistItineraryResult =
  | { status: "created" | "updated"; day: ItineraryDay; stops: ItineraryStop[] }
  | { status: "conflict" };

/**
 * Creates (or rebuilds in place) one itinerary_days row plus its
 * itinerary_stops, atomically. A new-day insert that loses the
 * (userId, hotelId, dayNumber) race to a concurrent request returns
 * { status: "conflict" } instead of throwing — the caller re-fetches and
 * returns the winner's itinerary rather than erroring. Rebuilding an
 * existing day (cooldown expired) isn't subject to that race: it's an
 * UPDATE of an already-resolved row id, not an INSERT competing for a new
 * unique key.
 */
export async function persistItinerary(input: PersistItineraryInput): Promise<PersistItineraryResult> {
  try {
    return await db.transaction(async (tx) => {
      let day: ItineraryDay;

      if (input.existingDayId) {
        await tx.delete(itineraryStops).where(eq(itineraryStops.dayId, input.existingDayId));
        const [updated] = await tx
          .update(itineraryDays)
          .set({
            stopCount: input.stops.length,
            routeGeoJson: input.routeGeoJson,
            totalDurationSeconds: input.totalDurationSeconds,
            generatedAt: input.generatedAt,
            completedAt: input.completedAt,
          })
          .where(eq(itineraryDays.id, input.existingDayId))
          .returning();
        day = updated;
      } else {
        const [created] = await tx
          .insert(itineraryDays)
          .values({
            userId: input.userId,
            hotelId: input.hotelId,
            hotelStayId: input.hotelStayId,
            dayNumber: input.dayNumber,
            stopCount: input.stops.length,
            routeGeoJson: input.routeGeoJson,
            totalDurationSeconds: input.totalDurationSeconds,
            generatedAt: input.generatedAt,
            completedAt: input.completedAt,
          })
          .returning();
        day = created;
      }

      const stops = await tx
        .insert(itineraryStops)
        .values(
          input.stops.map((stop, index) => ({
            dayId: day.id,
            position: index,
            ...stop,
          }))
        )
        .returning();

      return { status: input.existingDayId ? "updated" : "created", day, stops } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "conflict" };
    throw error;
  }
}
