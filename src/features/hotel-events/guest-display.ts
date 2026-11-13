import { CLOCK, TBILISI_TIME_ZONE } from "@/lib/format";

/*
 * How a hotel event reads on the guest map: that something is happening, and when, in Tbilisi time. Nothing here may
 * suggest booking, seats or reservations — Atlas does not hold any (db/schema/hotel-events.ts).
 *
 * The words are worked out on the server, at the moment the page is made, and sent as plain strings, so the browser
 * never computes "Today" from a different clock and disagrees with the server's render.
 */

const DAY = 86_400_000;

/** "2026-11-13": the Tbilisi calendar day of an instant. Tbilisi keeps UTC+04:00 all year, so "+24h" is "tomorrow". */
const CALENDAR_DAY = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TBILISI_TIME_ZONE });

/** "Sat 22 Nov" */
const WEEKDAY_DAY_MONTH = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: TBILISI_TIME_ZONE });

export type GuestEventTimes = { startsAt: Date; endsAt: Date };

/** "Today", "Tomorrow", or "Sat 22 Nov" — the Tbilisi day of `date`, as seen at `now`. */
export function eventDayLabel(date: Date, now: Date): string {
  const day = CALENDAR_DAY.format(date);
  if (day === CALENDAR_DAY.format(now)) return "Today";
  if (day === CALENDAR_DAY.format(new Date(now.getTime() + DAY))) return "Tomorrow";
  return WEEKDAY_DAY_MONTH.format(date).replace(",", "");
}

export function isHappeningNow(event: GuestEventTimes, now: Date): boolean {
  return event.startsAt.getTime() <= now.getTime() && now.getTime() < event.endsAt.getTime();
}

/** When it starts, in a few words: "Today 19:00", "Tomorrow 10:30", "Sat 22 Nov 18:00", or "Now · until 21:00". */
export function eventWhen(event: GuestEventTimes, now: Date): string {
  if (isHappeningNow(event, now)) return `Now · until ${CLOCK.format(event.endsAt)}`;
  return `${eventDayLabel(event.startsAt, now)} ${CLOCK.format(event.startsAt)}`;
}

/** Its day and time range: "Today 19:00–21:00", or "Sat 22 Nov 22:00 – Sun 23 Nov 01:00" across midnight. */
export function eventTimeRange(event: GuestEventTimes, now: Date): string {
  const startDay = eventDayLabel(event.startsAt, now);
  const endDay = eventDayLabel(event.endsAt, now);
  const start = CLOCK.format(event.startsAt);
  const end = CLOCK.format(event.endsAt);
  return startDay === endDay ? `${startDay} ${start}–${end}` : `${startDay} ${start} – ${endDay} ${end}`;
}

/** The one line a place card shows for its soonest event: "Event · Today 19:00 · Wine tasting". */
export function eventCardLine(event: { title: string; when: string }): string {
  return `Event · ${event.when} · ${event.title}`;
}

/** An event as the guest map receives it: plain strings only. */
export type GuestPlaceEvent = {
  id: string;
  title: string;
  description: string | null;
  /** eventWhen */
  when: string;
  /** eventTimeRange */
  range: string;
  happeningNow: boolean;
};

/**
 * Attaches each event to its venue, for the places the guest's map already lists. An event whose venue is not in that
 * list is skipped: this never adds a place. Each place's events are soonest first.
 */
export function eventsByVenue(
  events: readonly ({ id: string; venuePlaceId: string; title: string; description: string | null } & GuestEventTimes)[],
  listedPlaceIds: Iterable<string>,
  now: Date
): Map<string, GuestPlaceEvent[]> {
  const listed = new Set(listedPlaceIds);
  const byVenue = new Map<string, GuestPlaceEvent[]>();
  const ordered = [...events].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id));
  for (const event of ordered) {
    if (!listed.has(event.venuePlaceId)) continue;
    const entry: GuestPlaceEvent = {
      id: event.id,
      title: event.title,
      description: event.description,
      when: eventWhen(event, now),
      range: eventTimeRange(event, now),
      happeningNow: isHappeningNow(event, now),
    };
    byVenue.set(event.venuePlaceId, [...(byVenue.get(event.venuePlaceId) ?? []), entry]);
  }
  return byVenue;
}
