/**
 * Translates Map Advisor Functional's free-running `dayNumber = (previousDay?.dayNumber ?? 0) + 1`
 * counter into Atlas's calendar-accurate version: dayNumber is derived from
 * the stay's real check-in date, not from how many times the guest happened
 * to click "generate." Check-in's own calendar date is Day 1; the next
 * calendar date is Day 2, regardless of what time of day check-in happened.
 *
 * Pure and deterministic — no DB, no clock reads of its own (`now` is always
 * passed in) — so it's independently testable without an active HotelStay.
 */
export type DayNumberResult = { ok: true; dayNumber: number } | { ok: false; message: string };

function startOfUtcDay(date: Date): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

const MS_PER_DAY = 86400000;

export function calculateDayNumber(checkIn: Date, checkOut: Date | null, now: Date): DayNumberResult {
  const checkInDay = startOfUtcDay(checkIn);
  const nowDay = startOfUtcDay(now);
  const diffDays = Math.round((nowDay - checkInDay) / MS_PER_DAY);

  if (diffDays < 0) {
    return { ok: false, message: "This stay hasn't started yet." };
  }

  if (checkOut !== null && nowDay > startOfUtcDay(checkOut)) {
    return { ok: false, message: "This stay has already ended." };
  }

  return { ok: true, dayNumber: diffDays + 1 };
}
