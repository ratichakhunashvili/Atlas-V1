import { adminRedirect, type AdminViewer } from "./admin-route-policy";

/*
 * The proxy's decisions (src/proxy.ts), kept pure so they are tested without Next.js. UX only: these redirects save a
 * flash of a screen the visitor can't use. The authorization boundary stays server-side (requireUser, requireAdmin,
 * currentSession in lib/authorization.ts), on every page, route handler and server action.
 */

/** Query value that makes /login and /admin/sign-in say "Your session ended." */
export const SESSION_ENDED_REASON = "session-ended";

/**
 * Guest screens that need a signed-in guest. Exact entries are single pages; prefixes also cover the paths below them.
 * Design-preview screens with similar names (/plan/ready, /scan/wrong-code, /achievements/achievement-1, …) are not
 * here: the proxy 404s them first where they are blocked, and they stay open on `npm run dev` for design review.
 * /scan is exact so that the public /scan-hotel is never caught.
 */
export const GUEST_PROTECTED_EXACT = [
  "/",
  "/plan",
  "/plan/unlocked",
  "/scan",
  "/achievements",
  "/privacy/delete-account",
] as const;
export const GUEST_PROTECTED_PREFIXES = [
  "/profile",
  "/experiences",
  "/collection",
  "/checkin",
  "/unlock",
  "/preferences",
  "/directions",
  "/places",
] as const;

export function isGuestProtectedPath(pathname: string): boolean {
  return (
    (GUEST_PROTECTED_EXACT as readonly string[]).includes(pathname) ||
    GUEST_PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}

/**
 * Only page loads (GET/HEAD) go through Auth.js in the proxy. Auth.js re-issues the session cookie on every request it
 * sees; on a server-action POST that re-issued cookie arrives together with sign-out's clearing cookie, and the
 * browser could keep the session (audit CAND-00). A POST needs no early redirect: the action itself re-checks.
 */
export function proxyReadsSession(method: string): boolean {
  return method === "GET" || method === "HEAD";
}

const SESSION_COOKIE = /^(__Secure-)?authjs\.session-token(\.\d+)?$/;

/** Whether the browser sent an Auth.js session cookie (possibly split into numbered chunks). */
export function hasSessionCookie(cookieNames: readonly string[]): boolean {
  return cookieNames.some((name) => SESSION_COOKIE.test(name));
}

/**
 * Anything other than the browser loading a page as a document: React Server Component fetches, prefetches, scripts.
 * Decided by the browser-set Sec-Fetch-Dest header, because Next.js strips its own RSC and prefetch markers before the
 * proxy sees the request (verified in the 2026-11-13 trace: prefetches arrived looking like plain GETs). A request
 * without the header (not a browser) is treated as background too, so only real page loads refresh a session cookie.
 */
export function isBackgroundRequest(headers: Headers): boolean {
  if (headers.has("rsc") || headers.has("next-router-prefetch") || headers.get("purpose") === "prefetch") return true;
  return headers.get("sec-fetch-dest") !== "document";
}

/** The response with every Set-Cookie that would write an Auth.js session cookie removed; other cookies are kept. */
export function withoutSessionCookieRefresh(response: Response): Response {
  const cookies = response.headers.getSetCookie();
  if (!cookies.some((cookie) => SESSION_COOKIE.test(cookie.split("=")[0]?.trim() ?? ""))) return response;
  response.headers.delete("set-cookie");
  for (const cookie of cookies) if (!SESSION_COOKIE.test(cookie.split("=")[0]?.trim() ?? "")) response.headers.append("set-cookie", cookie);
  return response;
}

export function guestSignInPath(callbackUrl: string, sessionEnded: boolean): string {
  const query = new URLSearchParams({ callbackUrl });
  if (sessionEnded) query.set("reason", SESSION_ENDED_REASON);
  return `/login?${query.toString()}`;
}

/**
 * Where a page load should go before it renders, or null to let it through.
 * `viewer` is the session Auth.js could read from the cookie (null when none, or when it is expired or invalid).
 * `sessionCookie`: the browser sent a session cookie anyway, so a missing viewer means the session ended.
 */
export function sessionRedirect(input: {
  pathname: string;
  search: string;
  viewer: AdminViewer;
  sessionCookie: boolean;
}): string | null {
  const sessionEnded = !input.viewer && input.sessionCookie;
  const admin = adminRedirect(input.pathname, input.viewer, { search: input.search, sessionEnded });
  if (admin) return admin;
  if (!input.viewer && isGuestProtectedPath(input.pathname)) {
    return guestSignInPath(`${input.pathname}${input.search}`, sessionEnded);
  }
  return null;
}
