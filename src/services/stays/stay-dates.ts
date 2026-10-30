/**
 * Guest-declared stay dates, validated as pure rules (no I/O, `now` always passed in).
 *
 * Dates are calendar dates in UTC, matching how stay days are counted (services/advisor/stay-day.ts). A stay's
 * LAST day is its expected departure date, inclusive. Nothing here claims the dates are true — see
 * STAY_DATES_SOURCES: they are the guest's declaration unless a supported source verified them.
 */

const MS_PER_DAY = 86_400_000;

/** How far back an arrival date may be corrected, and how far ahead it may be declared. */
export const MAX_ARRIVAL_DAYS_IN_PAST = 30;
export const MAX_ARRIVAL_DAYS_IN_FUTURE = 14;
/** The longest stay Atlas will plan around. */
export const MAX_STAY_NIGHTS = 30;

export type StayDatesProblem =
  | "invalid_date"
  | "arrival_too_early"
  | "arrival_too_late"
  | "arrival_locked"
  | "departure_not_after_arrival"
  | "departure_in_past"
  | "stay_too_long";

export type StayDatesValidation =
  | { ok: true; checkIn: Date; expectedCheckOut: Date }
  | { ok: false; problem: StayDatesProblem; message: string };

const MESSAGES: Record<StayDatesProblem, string> = {
  invalid_date: "Enter both dates as real calendar dates.",
  arrival_too_early: `Your arrival can be at most ${MAX_ARRIVAL_DAYS_IN_PAST} days ago.`,
  arrival_too_late: `Your arrival can be at most ${MAX_ARRIVAL_DAYS_IN_FUTURE} days from now.`,
  arrival_locked:
    "Your arrival date is fixed once you have a plan, because your plans are numbered by day of stay. You can still change your departure date.",
  departure_not_after_arrival: "Your departure must be after your arrival.",
  departure_in_past: "Your departure can't be in the past. If you've already left, scan your next hotel instead.",
  stay_too_long: `Atlas plans stays of up to ${MAX_STAY_NIGHTS} nights.`,
};

function problem(code: StayDatesProblem): StayDatesValidation {
  return { ok: false, problem: code, message: MESSAGES[code] };
}

/** "YYYY-MM-DD" -> that day's UTC midnight, or null for anything that is not a real calendar date. */
export function parseCalendarDate(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls 2026-02-31 into March; a real date round-trips unchanged.
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
}

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function toCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function validateStayDates(input: {
  /** The posted arrival date, "YYYY-MM-DD". */
  checkIn: unknown;
  /** The posted departure date, "YYYY-MM-DD". */
  expectedCheckOut: unknown;
  now: Date;
  /** The stay's current arrival. When arrival is locked, the posted value must be the same calendar day. */
  currentCheckIn: Date;
  /** True once any itinerary day exists for this stay. */
  arrivalLocked: boolean;
}): StayDatesValidation {
  const checkIn = parseCalendarDate(input.checkIn);
  const expectedCheckOut = parseCalendarDate(input.expectedCheckOut);
  if (!checkIn || !expectedCheckOut) return problem("invalid_date");

  const today = startOfUtcDay(input.now);

  if (input.arrivalLocked) {
    if (checkIn.getTime() !== startOfUtcDay(input.currentCheckIn)) return problem("arrival_locked");
  } else {
    const daysFromToday = Math.round((checkIn.getTime() - today) / MS_PER_DAY);
    if (daysFromToday < -MAX_ARRIVAL_DAYS_IN_PAST) return problem("arrival_too_early");
    if (daysFromToday > MAX_ARRIVAL_DAYS_IN_FUTURE) return problem("arrival_too_late");
  }

  if (expectedCheckOut.getTime() <= checkIn.getTime()) return problem("departure_not_after_arrival");
  if (expectedCheckOut.getTime() < today) return problem("departure_in_past");
  if (Math.round((expectedCheckOut.getTime() - checkIn.getTime()) / MS_PER_DAY) > MAX_STAY_NIGHTS) return problem("stay_too_long");

  // A locked arrival keeps its exact stored instant (it may carry a time of day); only an edited one becomes a date.
  return { ok: true, checkIn: input.arrivalLocked ? input.currentCheckIn : checkIn, expectedCheckOut };
}
