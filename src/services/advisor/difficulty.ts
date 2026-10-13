/** Exact constants from Map Advisor Functional's src/actions/itinerary.ts. */
export const MIN_STOPS = 4;
export const MAX_STOPS = 8;
/** A day counts as "easy" if it's finished in under half the estimated walking time. */
export const EASY_COMPLETION_RATIO = 0.5;

/**
 * The subset of a generated day's outcome the ratchet needs — not the full
 * `ItineraryDay` row, so this stays testable without touching persistence.
 * `allStopsVisited` is a derived fact (every stop's visitedAt is non-null)
 * the itinerary service computes from its stops; it isn't its own DB column.
 */
export type PreviousDayOutcome = {
  stopCount: number;
  allStopsVisited: boolean;
  completedAt: Date | null;
  generatedAt: Date;
  totalDurationSeconds: number | null;
};

/**
 * The adaptive-difficulty ratchet: never decreases because a day was hard,
 * increases by exactly 1 (capped at MAX_STOPS) only when the previous day
 * was fully visited, completed, and finished in under half its estimated
 * walking time. No history -> MIN_STOPS. Pure and deterministic — no DB, no
 * Mapbox, no randomness, no pool-size clamping (that's the later itinerary
 * service's job: desired difficulty vs. available candidates are separate
 * concerns).
 */
export function calculateNextStopCount(previousDay: PreviousDayOutcome | null): number {
  if (previousDay === null) return MIN_STOPS;

  const { stopCount, allStopsVisited, completedAt, generatedAt, totalDurationSeconds } = previousDay;

  if (allStopsVisited && completedAt !== null && totalDurationSeconds !== null) {
    const actualSeconds = (completedAt.getTime() - generatedAt.getTime()) / 1000;
    if (actualSeconds < totalDurationSeconds * EASY_COMPLETION_RATIO) {
      return Math.min(MAX_STOPS, stopCount + 1);
    }
  }

  return stopCount;
}
