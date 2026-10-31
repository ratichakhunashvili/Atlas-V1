import type { Place, PlaceCategory } from "@/db/schema";

/**
 * How long a guest spends AT a stop, as opposed to walking between them.
 *
 * An admin-configured `places.visit_duration_minutes` is always preferred. When
 * none is set, the Advisor uses the explicit, deterministic table below rather
 * than guessing per plan — the same Place always produces the same number, so two
 * guests with the same interests get comparably shaped days.
 *
 * Missing is never zero. A stop that costs no time would let the Advisor promise a
 * day the guest cannot actually walk, which is the failure this module exists to
 * prevent. Every fallback is reported as an estimate so the UI can say so.
 */

/** Used when a category has no entry of its own: a plain half-hour visit. */
export const DEFAULT_VISIT_DURATION_MINUTES = 30;

/**
 * Per-category estimates, in minutes. Deliberately conservative: over-estimating
 * costs the guest a stop, under-estimating makes them late back to the hotel.
 */
export const CATEGORY_VISIT_DURATION_MINUTES: Record<PlaceCategory, number> = {
  restaurant: 75,
  spa: 90,
  tour: 120,
  shop: 30,
  landmark: 30,
  historical: 45,
  nature: 60,
  museum: 60,
  beach: 90,
  nightlife: 90,
  attraction: 60,
  activity: 60,
  // The hotel is the route's origin and return point, never a stop; this entry
  // exists only so the record is total.
  hotel: 30,
  other: DEFAULT_VISIT_DURATION_MINUTES,
};

export type VisitDurationSource = "configured" | "category_estimate";

export type VisitDuration = {
  minutes: number;
  source: VisitDurationSource;
};

/** Resolves the time to budget for one Place, and says where the number came from. */
export function resolveVisitDuration(
  place: Pick<Place, "category" | "visitDurationMinutes">
): VisitDuration {
  const configured = place.visitDurationMinutes;
  // A stored zero or negative would be a data error that the places CHECK already
  // forbids; treat it as unconfigured rather than as "no time needed".
  if (typeof configured === "number" && configured > 0) {
    return { minutes: configured, source: "configured" };
  }

  return {
    minutes: CATEGORY_VISIT_DURATION_MINUTES[place.category] ?? DEFAULT_VISIT_DURATION_MINUTES,
    source: "category_estimate",
  };
}

/**
 * The time to budget for a SAVED stop, from its snapshot.
 *
 * A stop generated before the Advisor budgeted time has no snapshot. It is
 * reported as unknown rather than as zero, so a caller must decide what to do
 * about it instead of silently treating the stop as free.
 */
export function savedStopVisitMinutes(stop: {
  visitDurationMinutes: number | null;
  category: PlaceCategory | null;
}): { minutes: number; known: boolean } {
  if (typeof stop.visitDurationMinutes === "number" && stop.visitDurationMinutes > 0) {
    return { minutes: stop.visitDurationMinutes, known: true };
  }

  const category = stop.category;
  const estimate = category
    ? CATEGORY_VISIT_DURATION_MINUTES[category] ?? DEFAULT_VISIT_DURATION_MINUTES
    : DEFAULT_VISIT_DURATION_MINUTES;

  return { minutes: estimate, known: false };
}
