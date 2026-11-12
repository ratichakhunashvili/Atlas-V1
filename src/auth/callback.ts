/**
 * Where to go after signing in or creating an account: a same-site path, with its query string
 * (/admin/analytics?days=7 must come back with its period). Never another site, however disguised:
 * not `//host` (protocol-relative), not `/\host` (browsers read a backslash as a slash), not an
 * encoded form of either (/%2F%2Fhost, /%5Chost), and nothing with control characters (a tab in
 * `/<tab>/host` is stripped by browsers, leaving //host).
 *
 * It matters most for a guest who scans a hotel code before having an account: the code's link
 * (/checkin/<code>) has to survive "Create account", or they land on the home page and the scan
 * seems to have done nothing.
 */
export function safeCallback(value: unknown, fallback: string): string {
  return typeof value === "string" && isSameSitePath(value) ? value : fallback;
}

const SAME_SITE_PROBE = "http://atlas.invalid";
/** Backslashes and ASCII control characters (tab, newline, …), which URL parsers drop or rewrite. */
const UNSAFE_CHARACTER = /[\\\u0000-\u001f\u007f]/;

function isSameSitePath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || UNSAFE_CHARACTER.test(value)) return false;
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return false;
  }
  // Decoded only for this check (the value itself is returned as given): an encoded // or /\ at the start.
  if (decoded.startsWith("//") || UNSAFE_CHARACTER.test(decoded.slice(0, 2))) return false;
  try {
    return new URL(value, SAME_SITE_PROBE).origin === SAME_SITE_PROBE;
  } catch {
    return false;
  }
}

/**
 * True when a sign-in was sent here from a protected page (so the screen can say "Sign in to continue.").
 * The home page "/" is the default landing, not a redirect worth explaining. Never exposes the path itself.
 */
export function hasProtectedCallback(value: unknown): boolean {
  const safe = safeCallback(value, "");
  return safe !== "" && safe !== "/";
}

/** "?callbackUrl=…" for links between the sign-in and sign-up screens, or "" when there is nothing safe to carry. */
export function callbackQuery(callbackUrl: string | undefined): string {
  if (!callbackUrl) return "";
  const safe = safeCallback(callbackUrl, "");
  return safe ? `?callbackUrl=${encodeURIComponent(safe)}` : "";
}
