/**
 * Test-only hotel picker (owner request, 2026-11-17). Normally only a hotel's QR code starts a stay. For testing,
 * the accounts listed in TEST_HOTEL_PICKER_EMAILS (comma-separated, set privately in Vercel) may pick a hotel from a
 * list on "Join your hotel" instead. Unset or empty means nobody: the default is the normal QR-only rule.
 */
export function parseTestHotelPickerEmails(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0)
  );
}

export function isTestHotelPickerAllowed(email: string | null | undefined, value: string | undefined = process.env.TEST_HOTEL_PICKER_EMAILS): boolean {
  if (!email) return false;
  return parseTestHotelPickerEmails(value).has(email.trim().toLowerCase());
}

/**
 * Open join (owner request, 2026-11-18, temporary): every signed-in guest sees these hotels on "Join your hotel"
 * with a Join button, no QR code needed. Only these ids are accepted by the open-join action. Skillwill's test base.
 */
export const OPEN_JOIN_HOTEL_IDS: readonly string[] = ["5c111000-0000-4000-8000-000000000002"];

export function isOpenJoinHotel(hotelId: string): boolean {
  return OPEN_JOIN_HOTEL_IDS.includes(hotelId);
}
