/*
 * Small display formatters shared by guest and admin screens. Atlas starts in Georgia, so times and dates read in
 * Tbilisi time whatever the server's clock is set to.
 */

export const TBILISI_TIME_ZONE = "Asia/Tbilisi";

/** "14:05" */
export const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TBILISI_TIME_ZONE });

/** "12 Mar" */
export const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: TBILISI_TIME_ZONE });

/** "12 Mar 2026" */
export const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: TBILISI_TIME_ZONE });

/** A stored category such as "historical" or "hotel_restaurant" as a label: "Historical", "Hotel restaurant". */
export function categoryLabel(value: string | null): string {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}
