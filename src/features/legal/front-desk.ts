import { validStayHotelName, type StayForLabel } from "./stay-hotel";

/**
 * "Call <hotel>": offered only when the signed-in guest has a valid current stay AND that hotel's Place has a phone
 * number that can be dialled. Otherwise there is no call button at all, only RECEPTION_FALLBACK: a guest is never
 * shown a call action that does nothing.
 */

export type FrontDesk = { hotelName: string; telHref: string; displayPhone: string };

/** What a guest without a callable hotel sees instead of a call button. */
export const RECEPTION_FALLBACK = "Ask at your hotel's reception.";

/** E.164 allows at most 15 digits; anything under 6 digits is not a reachable hotel line. */
const MIN_DIGITS = 6;
const MAX_DIGITS = 15;

/**
 * A stored phone number as a `tel:` href, or null when it cannot be dialled as written.
 *
 * Keeps one leading "+" and the digits; drops spaces, dots, dashes and brackets. Anything else (letters, an extension
 * marker, a second "+") makes it null rather than guessed at. Never adds a country code that was not stored.
 */
export function normalizePhoneForTel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;
  return `tel:${trimmed.startsWith("+") ? "+" : ""}${digits}`;
}

/** The call action for this stay, or null when there is no valid stay or no dialable number. */
export function frontDeskFor(stay: (StayForLabel & { phone: string | null }) | null, now: Date): FrontDesk | null {
  if (!stay) return null;
  const hotelName = validStayHotelName(stay, now);
  if (!hotelName) return null;
  const telHref = normalizePhoneForTel(stay.phone);
  if (!telHref) return null;
  return { hotelName, telHref, displayPhone: stay.phone!.trim() };
}
