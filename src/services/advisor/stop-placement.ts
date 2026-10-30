/**
 * Where a hotel's own activity sits in the day.
 *
 * A hotel facility or a hotel event goes at the START or the END of the route,
 * never in the middle. The guest is already at the hotel when they set off and
 * back at it when they finish, so a spa in the middle means walking home and out
 * again — the one shape a walking loop should never have.
 *
 * Which end alternates by day number, so a three-day stay does not become three
 * identical mornings. Odd days open with it, even days close with it.
 *
 * All of this is pure ordering: these functions never add, drop or substitute a
 * stop, and the sequence they return is routed in exactly that order
 * (services/routing's in-order route), never re-optimised afterwards.
 */

export type Placement = "first" | "last";

export function placementForDay(dayNumber: number): Placement {
  return dayNumber % 2 === 1 ? "first" : "last";
}

/**
 * Where a scheduled event has to go, which is a timing fact rather than a
 * preference: an event in the later part of the guest's window cannot be the
 * first thing they do, and one starting almost immediately cannot be the last.
 */
export function placementForEvent(input: {
  startsAt: Date;
  now: Date;
  availableMinutes: number;
}): Placement {
  const minutesUntilStart = (input.startsAt.getTime() - input.now.getTime()) / 60_000;
  return minutesUntilStart <= input.availableMinutes / 2 ? "first" : "last";
}

/**
 * Puts the hotel's own activities at the ends of an otherwise routed order.
 *
 * When both an event and a facility want an end, the EVENT wins the one its
 * schedule requires — it is the only stop with a fixed clock time — and the
 * facility takes the other end.
 */
export function placeHotelActivities<T>(input: {
  middle: readonly T[];
  facility: { stop: T; placement: Placement } | null;
  event: { stop: T; placement: Placement } | null;
}): T[] {
  const { middle, facility, event } = input;

  const first: T[] = [];
  const last: T[] = [];

  if (event) {
    (event.placement === "first" ? first : last).push(event.stop);
  }

  if (facility) {
    // The end the event has taken is no longer available; the facility goes to
    // the other one rather than being dropped or pushed into the middle.
    const taken = event?.placement;
    const placement = taken === facility.placement ? (taken === "first" ? "last" : "first") : facility.placement;
    (placement === "first" ? first : last).push(facility.stop);
  }

  return [...first, ...middle, ...last];
}
