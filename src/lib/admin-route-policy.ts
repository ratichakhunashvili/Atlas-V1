/*
 * Where the proxy sends a request for an /admin page, before it renders. UX only: it saves a flash
 * of the console for people who can't use it. The authorization boundary stays requireAdmin(),
 * which every admin page and server action calls and which reads the role from the database.
 */

export const ADMIN_SIGN_IN_PATH = "/admin/sign-in";
export const ADMIN_DENIED_PATH = "/admin/denied";

export type AdminViewer = { role?: string } | null;

/** The path to redirect to, or null to let the request through. */
export function adminRedirect(pathname: string, viewer: AdminViewer): string | null {
  if (pathname !== "/admin" && !pathname.startsWith("/admin/")) return null;

  if (pathname === ADMIN_SIGN_IN_PATH) {
    return viewer?.role === "admin" ? "/admin" : null;
  }
  if (pathname === ADMIN_DENIED_PATH) return null;

  if (!viewer) return `${ADMIN_SIGN_IN_PATH}?callbackUrl=${encodeURIComponent(pathname)}`;
  if (viewer.role !== "admin") return ADMIN_DENIED_PATH;
  return null;
}
