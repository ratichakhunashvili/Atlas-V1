import type { HotelEvent } from "@/db/schema";

/**
 * Which scheduled hotel event, if any, a guest's plan may include.
 *
 * Four things must all hold, and they are checked here rather than anywhere a
 * query might forget one:
 *
 *  1. The event belongs to the guest's OWN hotel. An event is hotel-specific in
 *     exactly the way a partnership is: another hotel's event is never offered.
 *  2. It is still scheduled, not cancelled.
 *  3. Its venue Place is eligible for that hotel — the same eligibility every
 *     other stop must pass. A venue that lost its partnership is not a loophole.
 *  4. It fits the guest's free time: it starts after they set off and finishes
 *     within the window they said they had.
 *
 * Nothing here reserves anything. Atlas is saying "this is happening, and you
 * could be there" — not that a seat exists or is held. No caller may present it
 * as a booking until booking is designed and approved.
 */

export type EventCompatibility =
  | { ok: true }
  | { ok: false; reason: "wrong_hotel" | "cancelled" | "venue_not_eligible" | "already_started" | "ends_after_window" };

export function evaluateEventForPlan(input: {
  event: Pick<HotelEvent, "hotelId" | "venuePlaceId" | "status" | "startsAt" | "endsAt">;
  hotelId: string;
  eligiblePlaceIds: ReadonlySet<string>;
  now: Date;
  availableMinutes: number;
}): EventCompatibility {
  const { event, hotelId, eligiblePlaceIds, now, availableMinutes } = input;

  if (event.hotelId !== hotelId) return { ok: false, reason: "wrong_hotel" };
  if (event.status !== "scheduled") return { ok: false, reason: "cancelled" };
  if (!eligiblePlaceIds.has(event.venuePlaceId)) return { ok: false, reason: "venue_not_eligible" };

  // Already under way: Atlas does not send a guest to arrive halfway through.
  if (event.startsAt.getTime() < now.getTime()) return { ok: false, reason: "already_started" };

  const windowEnd = now.getTime() + availableMinutes * 60_000;
  if (event.endsAt.getTime() > windowEnd) return { ok: false, reason: "ends_after_window" };

  return { ok: true };
}

/**
 * The soonest compatible event, or none.
 *
 * At most one event per plan: a day built around two fixed appointments is a
 * timetable, not a walk, and Atlas does not yet model arrival clock times well
 * enough to promise two.
 */
export function chooseEventForPlan(input: {
  events: readonly HotelEvent[];
  hotelId: string;
  eligiblePlaceIds: ReadonlySet<string>;
  now: Date;
  availableMinutes: number;
}): HotelEvent | null {
  const compatible = input.events.filter(
    (event) =>
      evaluateEventForPlan({
        event,
        hotelId: input.hotelId,
        eligiblePlaceIds: input.eligiblePlaceIds,
        now: input.now,
        availableMinutes: input.availableMinutes,
      }).ok
  );

  if (compatible.length === 0) return null;

  // Deterministic: soonest first, then by id so two events starting at the same
  // moment always resolve the same way.
  return [...compatible].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id)
  )[0];
}

/** How long to budget for attending: the event's own length, which the schema guarantees is positive. */
export function eventDurationMinutes(event: Pick<HotelEvent, "startsAt" | "endsAt">): number {
  return Math.max(1, Math.round((event.endsAt.getTime() - event.startsAt.getTime()) / 60_000));
}

/**
 * Below this, turning up is not worth the walk, so the event is dropped from the
 * plan instead of being offered as a token appearance.
 */
export const MIN_EVENT_ATTENDANCE_MINUTES = 15;

export type EventArrival =
  | { ok: true; attendMinutes: number }
  | { ok: false; reason: "arrives_before_start" | "arrives_after_end" | "too_little_left" };

/**
 * Can the guest actually attend, given when the route gets them there?
 *
 * The window check in `evaluateEventForPlan` only asks whether the event falls
 * inside the guest's free time. This asks the harder question, once the stops have
 * really been ordered and routed: walking to the earlier stops and spending time at
 * them takes however long it takes, and the event does not wait.
 *
 * Arriving EARLY is treated as a failure, not a success. Atlas does not model a
 * guest standing outside a closed door — there is no "wait here for 40 minutes"
 * step in any plan — so pretending an early arrival works would be promising
 * something the itinerary does not actually describe. The event is omitted and the
 * rest of the day is planned without it.
 *
 * Arriving part-way through is allowed: the time budgeted becomes what is left of
 * the event, never its full length, so the saved plan cannot claim more of the
 * guest's day than the event can still give them.
 */
export function evaluateEventArrival(input: {
  startsAt: Date;
  endsAt: Date;
  estimatedArrival: Date;
  minAttendanceMinutes?: number;
}): EventArrival {
  const minimum = input.minAttendanceMinutes ?? MIN_EVENT_ATTENDANCE_MINUTES;
  const arrival = input.estimatedArrival.getTime();

  if (arrival < input.startsAt.getTime()) return { ok: false, reason: "arrives_before_start" };
  if (arrival >= input.endsAt.getTime()) return { ok: false, reason: "arrives_after_end" };

  const attendMinutes = Math.floor((input.endsAt.getTime() - arrival) / 60_000);
  if (attendMinutes < minimum) return { ok: false, reason: "too_little_left" };

  return { ok: true, attendMinutes };
}
