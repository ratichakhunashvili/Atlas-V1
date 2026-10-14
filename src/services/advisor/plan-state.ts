/**
 * Pure helpers for the state of a day's ACTIVE plan (stops that have not been
 * superseded). Shared by the real persistence layer (db/queries/itinerary.ts)
 * and by the in-memory fakes used in tests, so "when is a day complete" has
 * exactly one definition.
 */

type StopLike = { visitedAt: Date | null; supersededAt?: Date | null };

export function activeStops<T extends StopLike>(stops: readonly T[]): T[] {
  return stops.filter((stop) => !stop.supersededAt);
}

/**
 * A day is complete only when it has at least one active stop and every
 * active stop is visited. Superseded stops (kept as history) never count.
 * An already-set completion time is kept; a day with pending stops is not complete.
 */
export function computeDayCompletedAt(stops: readonly StopLike[], existingCompletedAt: Date | null, now: Date): Date | null {
  const active = activeStops(stops);
  if (active.length === 0) return null;
  if (active.some((stop) => stop.visitedAt === null)) return null;
  return existingCompletedAt ?? now;
}
