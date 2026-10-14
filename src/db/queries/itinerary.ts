import "server-only";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  itineraryDays,
  itineraryStops,
  type CheckInMethod,
  type ItineraryDay,
  type ItineraryStop,
  type PlaceCategory,
} from "@/db/schema";
import { computeDayCompletedAt } from "@/services/advisor/plan-state";

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

/** The ACTIVE plan: stops that have not been superseded, in position order. Every guest-facing and check-in read uses this. */
export async function listItineraryStops(dayId: string) {
  return db
    .select()
    .from(itineraryStops)
    .where(and(eq(itineraryStops.dayId, dayId), isNull(itineraryStops.supersededAt)))
    .orderBy(asc(itineraryStops.position));
}

/** EVERY stop row of a day, including superseded ones — the saved history (snapshots are never deleted). */
export async function listAllItineraryStops(dayId: string) {
  return db.select().from(itineraryStops).where(eq(itineraryStops.dayId, dayId)).orderBy(asc(itineraryStops.position));
}

/** A stop plus its parent day — the day carries `userId`, the source of truth for ownership (a stop never trusts a client-supplied hotelId/userId). Null if the stop doesn't exist OR has been superseded (a superseded stop is history, never actionable). */
export async function findItineraryStopWithDay(stopId: string): Promise<{ stop: ItineraryStop; day: ItineraryDay } | null> {
  const [row] = await db
    .select({ stop: itineraryStops, day: itineraryDays })
    .from(itineraryStops)
    .innerJoin(itineraryDays, eq(itineraryDays.id, itineraryStops.dayId))
    .where(and(eq(itineraryStops.id, stopId), isNull(itineraryStops.supersededAt)))
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
      .where(and(eq(itineraryStops.id, stopId), isNull(itineraryStops.visitedAt), isNull(itineraryStops.supersededAt)))
      .returning();

    if (!updatedStop) return null;

    const remaining = await tx
      .select({ id: itineraryStops.id })
      .from(itineraryStops)
      // Superseded (history) stops never keep a day open: only ACTIVE unvisited stops count.
      .where(and(eq(itineraryStops.dayId, dayId), isNull(itineraryStops.visitedAt), isNull(itineraryStops.supersededAt)))
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

/** Place id -> the most recent itinerary dayNumber it appeared in, for this guest at this hotel — scoring.ts's UsageHistory input. Stops whose Place has since been deleted (placeId null) can't be tracked for freshness and are excluded. Completed visits always count (they are never superseded); superseded UNVISITED stops do not, because the guest never actually did them. */
export async function getStopUsageHistory(userId: string, hotelId: string): Promise<Map<string, number>> {
  const rows = await db
    .select({
      placeId: itineraryStops.placeId,
      dayNumber: itineraryDays.dayNumber,
    })
    .from(itineraryStops)
    .innerJoin(itineraryDays, eq(itineraryDays.id, itineraryStops.dayId))
    .where(and(eq(itineraryDays.userId, userId), eq(itineraryDays.hotelId, hotelId), isNull(itineraryStops.supersededAt)));

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
  /** Always null for newly generated stops (every stop starts unvisited). Only itineraries generated before the hotel filler was removed contain an auto-visited hotel stop. */
  visitedAt: Date | null;
};

export type PersistItineraryInput = {
  userId: string;
  hotelId: string;
  hotelStayId: string;
  dayNumber: number;
  /**
   * Non-null = an explicit in-place rebuild of this existing day. NOTHING is ever deleted: only the day's
   * PENDING (unvisited) active stops are superseded (reason plan_regenerated, rows and snapshots kept).
   * Completed stops are never touched — a DB CHECK also forbids superseding a visited stop. `stops` are the
   * NEW pending stops, appended after the highest existing position. Null inserts a brand-new day.
   */
  existingDayId: string | null;
  routeGeoJson: unknown;
  totalDurationSeconds: number;
  generatedAt: Date;
  /** New-day path only (always null: a generated day is never already complete). An in-place rebuild derives completion from the active stops. */
  completedAt: Date | null;
  stops: PersistStopInput[];
};

export type PersistItineraryResult =
  | { status: "created" | "updated"; day: ItineraryDay; stops: ItineraryStop[] }
  | { status: "conflict" };

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function listActiveStopsTx(tx: Tx, dayId: string): Promise<ItineraryStop[]> {
  return tx
    .select()
    .from(itineraryStops)
    .where(and(eq(itineraryStops.dayId, dayId), isNull(itineraryStops.supersededAt)))
    .orderBy(asc(itineraryStops.position));
}

async function nextPositionTx(tx: Tx, dayId: string): Promise<number> {
  // Over ALL rows including superseded ones, so a new stop never reuses a history row's position by accident.
  const [row] = await tx
    .select({ max: sql<number | null>`max(${itineraryStops.position})` })
    .from(itineraryStops)
    .where(eq(itineraryStops.dayId, dayId));
  return (row?.max ?? -1) + 1;
}

/**
 * Recomputes the day's derived fields from its ACTIVE stops. Completion is derived, never forced:
 * complete only if at least one active stop exists and all active stops are visited.
 */
async function refreshDayTx(
  tx: Tx,
  dayId: string,
  patch: { routeGeoJson?: unknown; totalDurationSeconds?: number | null; originalDurationSeconds?: number; generatedAt?: Date },
  now: Date
) {
  const [current] = await tx.select().from(itineraryDays).where(eq(itineraryDays.id, dayId)).limit(1);
  const active = await listActiveStopsTx(tx, dayId);
  const [day] = await tx
    .update(itineraryDays)
    .set({
      ...patch,
      stopCount: active.length,
      completedAt: computeDayCompletedAt(active, current?.completedAt ?? null, now),
    })
    .where(eq(itineraryDays.id, dayId))
    .returning();
  return { day, stops: active };
}

class ConcurrentChange extends Error {}

/**
 * Creates (or explicitly rebuilds in place) one itinerary_days row plus its itinerary_stops, atomically.
 * A new-day insert that loses the (userId, hotelId, dayNumber) race returns { status: "conflict" } instead
 * of throwing — the caller re-fetches and returns the winner's itinerary. An in-place rebuild is an UPDATE
 * of an already-resolved row id, so it is not subject to that race; it never deletes or supersedes a
 * completed stop (see PersistItineraryInput.existingDayId).
 */
export async function persistItinerary(input: PersistItineraryInput): Promise<PersistItineraryResult> {
  try {
    return await db.transaction(async (tx) => {
      if (input.existingDayId) {
        const dayId = input.existingDayId;
        // Only incomplete pending stops may be superseded. visited_at IS NULL is the guard (and a DB CHECK backs it).
        await tx
          .update(itineraryStops)
          .set({ supersededAt: input.generatedAt, supersededReason: "plan_regenerated" })
          .where(and(eq(itineraryStops.dayId, dayId), isNull(itineraryStops.visitedAt), isNull(itineraryStops.supersededAt)));

        if (input.stops.length > 0) {
          const start = await nextPositionTx(tx, dayId);
          await tx.insert(itineraryStops).values(input.stops.map((stop, index) => ({ dayId, position: start + index, ...stop })));
        }

        const { day, stops } = await refreshDayTx(
          tx,
          dayId,
          {
            routeGeoJson: input.routeGeoJson,
            totalDurationSeconds: input.totalDurationSeconds,
            // A full rebuild is a NEW plan, so its estimate is the new original estimate.
            originalDurationSeconds: input.totalDurationSeconds,
            generatedAt: input.generatedAt,
          },
          input.generatedAt
        );
        return { status: "updated", day, stops } as const;
      }

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
          // The generated estimate, kept separately from the active route estimate (which a repair updates).
          originalDurationSeconds: input.totalDurationSeconds,
          generatedAt: input.generatedAt,
          completedAt: input.completedAt,
        })
        .returning();

      const stops = await tx
        .insert(itineraryStops)
        .values(input.stops.map((stop, index) => ({ dayId: created.id, position: index, ...stop })))
        .returning();

      return { status: "created", day: created, stops } as const;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { status: "conflict" };
    throw error;
  }
}

export type StopReplacement = {
  /** The vacated slot: the replacement takes the position of the superseded stop, so stop order is preserved. */
  position: number;
  stop: PersistStopInput;
};

export type PersistStopReplacementInput = {
  dayId: string;
  /** The PENDING, currently-unavailable stops to supersede (rows kept as history). */
  supersedeStopIds: string[];
  replacements: StopReplacement[];
  routeGeoJson: unknown;
  /**
   * Walking time of the REPAIRED active route (what the guest sees). `originalDurationSeconds` is never touched,
   * so the difficulty ratchet still compares the real completion time with the original estimate.
   */
  totalDurationSeconds: number | null;
  now: Date;
};

export type PersistStopChangeResult = { status: "updated"; day: ItineraryDay; stops: ItineraryStop[] } | { status: "conflict" };

/**
 * Explicit replacement of unavailable pending stops. Supersedes ONLY the given stops, and only while they are
 * still pending and active (visited_at IS NULL AND superseded_at IS NULL — a completed stop can never match).
 * If any of them is no longer in that state (e.g. a check-in won a race) the whole change is rolled back and
 * { status: "conflict" } is returned. Nothing is deleted.
 */
export async function persistStopReplacement(input: PersistStopReplacementInput): Promise<PersistStopChangeResult> {
  try {
    return await db.transaction(async (tx) => {
      const superseded = await tx
        .update(itineraryStops)
        .set({ supersededAt: input.now, supersededReason: "stop_unavailable" })
        .where(
          and(
            eq(itineraryStops.dayId, input.dayId),
            inArray(itineraryStops.id, input.supersedeStopIds),
            isNull(itineraryStops.visitedAt),
            isNull(itineraryStops.supersededAt)
          )
        )
        .returning({ id: itineraryStops.id });
      if (superseded.length !== input.supersedeStopIds.length) throw new ConcurrentChange();

      if (input.replacements.length > 0) {
        await tx.insert(itineraryStops).values(input.replacements.map((r) => ({ dayId: input.dayId, position: r.position, ...r.stop })));
      }

      const { day, stops } = await refreshDayTx(
        tx,
        input.dayId,
        { routeGeoJson: input.routeGeoJson, totalDurationSeconds: input.totalDurationSeconds },
        input.now
      );
      return { status: "updated", day, stops } as const;
    });
  } catch (error) {
    if (error instanceof ConcurrentChange) return { status: "conflict" };
    throw error;
  }
}

export type PersistStopRemovalInput = {
  dayId: string;
  stopId: string;
  /** Route for the remaining pending stops, or null when it could not be recomputed (the stale line is then cleared rather than kept). */
  routeGeoJson: unknown;
  /** Walking time of the remaining route, or null when there is no route (nothing pending, or it could not be recomputed). */
  totalDurationSeconds: number | null;
  now: Date;
};

/** Explicit removal of ONE unavailable pending stop (reason removed_unavailable). The row and its snapshot are kept as history. */
export async function persistStopRemoval(input: PersistStopRemovalInput): Promise<PersistStopChangeResult> {
  try {
    return await db.transaction(async (tx) => {
      const removed = await tx
        .update(itineraryStops)
        .set({ supersededAt: input.now, supersededReason: "removed_unavailable" })
        .where(
          and(
            eq(itineraryStops.id, input.stopId),
            eq(itineraryStops.dayId, input.dayId),
            isNull(itineraryStops.visitedAt),
            isNull(itineraryStops.supersededAt)
          )
        )
        .returning({ id: itineraryStops.id });
      if (removed.length !== 1) throw new ConcurrentChange();

      const { day, stops } = await refreshDayTx(
        tx,
        input.dayId,
        { routeGeoJson: input.routeGeoJson, totalDurationSeconds: input.totalDurationSeconds },
        input.now
      );
      return { status: "updated", day, stops } as const;
    });
  } catch (error) {
    if (error instanceof ConcurrentChange) return { status: "conflict" };
    throw error;
  }
}
