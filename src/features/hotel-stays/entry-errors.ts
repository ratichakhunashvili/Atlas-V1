import { rateLimitedMessage } from "@/services/rate-limit/policy";

/*
 * Why a hotel code was not accepted, carried to the home screen as a short CODE in `?checkinError=`, never as text.
 * The home screen shows only the fixed sentence for a known code, so a crafted link cannot make Atlas display words of
 * its choosing (the 2026-11 replay showed "?checkinError=Your stay is suspended. Call ..." rendered as an Atlas alert).
 */
export const ENTRY_ERRORS = {
  invalid: "That code isn't a valid hotel entry code.",
  "rate-limited": rateLimitedMessage(),
  expired: "That request expired. Scan the hotel's code again.",
  unavailable: "Could not check in right now. Please try again.",
  "switch-failed": "Could not switch hotels right now. Please try again.",
} as const;

export type EntryErrorCode = keyof typeof ENTRY_ERRORS;

/** The code for one of the entry actions' messages; anything unrecognised becomes the generic "try again". */
export function entryErrorCode(message: string): EntryErrorCode {
  const match = (Object.keys(ENTRY_ERRORS) as EntryErrorCode[]).find((code) => ENTRY_ERRORS[code] === message);
  return match ?? "unavailable";
}

/** Where to send the guest after a refused entry. */
export function entryErrorPath(message: string): string {
  return `/?checkinError=${entryErrorCode(message)}`;
}

/** The sentence to show for a query value, or null for anything that is not one of the known codes. */
export function entryErrorMessage(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !Object.hasOwn(ENTRY_ERRORS, value)) return null;
  return ENTRY_ERRORS[value as EntryErrorCode];
}
