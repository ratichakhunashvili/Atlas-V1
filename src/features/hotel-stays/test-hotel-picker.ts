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
