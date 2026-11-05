/**
 * Hotel event times are Tbilisi wall-clock times. Atlas starts in Georgia, which keeps UTC+04:00 all year
 * (no daylight saving), so the offset is fixed and explicit. A `datetime-local` value carries no zone at
 * all: parsed with `new Date()` it would take the SERVER's zone, and on Vercel (UTC) an event typed as
 * 18:00 would be saved four hours late.
 */
export const EVENT_TIME_ZONE = "Asia/Tbilisi";
const TBILISI_OFFSET = "+04:00";

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

/** "2026-11-20T18:00" → the instant 18:00 in Tbilisi. Null for anything that isn't a datetime-local value. */
export function parseTbilisiDateTime(value: string): Date | null {
  if (!LOCAL_DATE_TIME.test(value)) return null;
  const withSeconds = value.length === 16 ? `${value}:00` : value;
  const date = new Date(`${withSeconds}${TBILISI_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "2026-11-20 18:00" in Tbilisi time, whatever the server's own zone is. */
export function formatTbilisiDateTime(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: EVENT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}`;
}
