/**
 * Where to go after signing in or creating an account. Only same-site paths, never `//host`
 * (protocol-relative), so a crafted link can't send anyone off-site.
 *
 * It matters most for a guest who scans a hotel code before having an account: the code's link
 * (/checkin/<code>) has to survive "Create account", or they land on the home page and the scan
 * seems to have done nothing.
 */
export function safeCallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : fallback;
}

/** "?callbackUrl=…" for links between the sign-in and sign-up screens, or "" when there is nothing safe to carry. */
export function callbackQuery(callbackUrl: string | undefined): string {
  if (!callbackUrl) return "";
  const safe = safeCallback(callbackUrl, "");
  return safe ? `?callbackUrl=${encodeURIComponent(safe)}` : "";
}
