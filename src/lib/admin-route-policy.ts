/*
 * Where the proxy sends a request for an /admin page, before it renders. UX only: it saves a flash
 * of the console for people who can't use it. The authorization boundary stays requireAdmin(),
 * which every admin page and server action calls and which reads the role from the database.
 */

export const ADMIN_SIGN_IN_PATH = "/admin/sign-in";
export const ADMIN_DENIED_PATH = "/admin/denied";

export type AdminViewer = { role?: string } | null;

export type AdminRedirectOptions = {
  /** The request's query string ("" or "?…"), kept in the callback so a deep link such as ?days=7 survives sign-in. */
  search?: string;
  /** The browser sent a session cookie that no longer holds a session (expired): say so on the sign-in screen. */
  sessionEnded?: boolean;
};

/** "reason=session-ended" in a query string: requireAdmin found the token's session ended (signed out elsewhere, reset). */
function asksForSignInAfterEndedSession(search: string | undefined): boolean {
  return new URLSearchParams(search ?? "").get("reason") === "session-ended";
}

/** The path to redirect to, or null to let the request through. */
export function adminRedirect(pathname: string, viewer: AdminViewer, options: AdminRedirectOptions = {}): string | null {
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) return null;

  if (pathname === ADMIN_SIGN_IN_PATH) {
    // A token that still says "admin" may belong to a session the server has ended. requireAdmin sends that here with
    // reason=session-ended; bouncing it back to /admin would loop, so the form is shown instead. A valid admin who
    // opens such a link just sees the sign-in form, which is harmless.
    if (viewer?.role === "admin" && !asksForSignInAfterEndedSession(options.search)) return "/admin";
    return null;
  }
  if (pathname === ADMIN_DENIED_PATH) return null;

  if (!viewer) {
    const query = new URLSearchParams({ callbackUrl: `${pathname}${options.search ?? ""}` });
    if (options.sessionEnded) query.set("reason", "session-ended");
    return `${ADMIN_SIGN_IN_PATH}?${query.toString()}`;
  }
  if (viewer.role !== "admin") return ADMIN_DENIED_PATH;
  return null;
}
