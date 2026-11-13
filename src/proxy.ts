import NextAuth from "next-auth";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { authConfig } from "@/auth/config";
import { shouldBlockDevelopmentOnlyPath } from "@/lib/development-route-policy";
import { hasSessionCookie, isBackgroundRequest, proxyReadsSession, sessionRedirect, withoutSessionCookieRefresh } from "@/lib/session-redirect";

// Separate, edge-safe NextAuth() call (shares authConfig with src/auth/index.ts
// but omits the Node-only Credentials provider) so this proxy never bundles
// db/bcrypt code for the Edge runtime.
const { auth } = NextAuth(authConfig);

const NOT_FOUND_REWRITE_PATH = "/atlas-not-found";

// This is an optimistic, UX-only check (redirect early, no flash of
// protected content). It is NOT the authorization boundary: every protected
// page re-checks with requireUser()/requireAdmin(), and every mutating
// server action re-checks again before touching the database. The guest and
// admin rules live in lib/session-redirect.ts and lib/admin-route-policy.ts.
const pageLoadProxy = auth((req) => {
  const { pathname, search } = req.nextUrl;
  const target = sessionRedirect({
    pathname,
    search,
    viewer: req.auth ? { role: req.auth.user.role } : null,
    sessionCookie: hasSessionCookie(req.cookies.getAll().map((cookie) => cookie.name)),
  });
  if (target) return NextResponse.redirect(new URL(target, req.nextUrl.origin));
});

export default async function proxy(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl;

  // First, and for every method: a blocked design-preview or development URL is a 404 whether it is loaded or posted to.
  if (shouldBlockDevelopmentOnlyPath(pathname, process.env.NODE_ENV, process.env.ATLAS_DEPLOYMENT_ENV)) {
    // Still a 404, but rendered by the branded app/not-found.tsx: rewrite to a path that does not exist, so a
    // blocked design-preview URL looks exactly like any unknown URL (and the browser never shows its own error page).
    return NextResponse.rewrite(new URL(NOT_FOUND_REWRITE_PATH, req.nextUrl.origin), { status: 404 });
  }

  // Auth.js appends a re-issued session cookie to every response it handles, after our callback has run. On a
  // server-action POST (the sidebar's Sign out posts to the current /admin page) that cookie raced sign-out's clearing
  // cookie and the browser could keep the session (audit CAND-00). So only page loads reach Auth.js here; everything
  // else passes untouched and is authorized by the action or route handler itself.
  if (!proxyReadsSession(req.method)) return NextResponse.next();

  const response = await (pageLoadProxy as unknown as (req: NextRequest, event: NextFetchEvent) => Promise<Response | undefined>)(req, event);
  // Background navigation fetches (React Server Component requests and prefetches) must not re-issue the session
  // cookie: one still in flight when Sign out answers would otherwise put the cleared cookie back. Only a full page
  // load keeps a session's cookie fresh (follow-up review, 2026-11-13).
  return response && isBackgroundRequest(req.headers) ? withoutSessionCookieRefresh(response) : response;
}

export const config = {
  matcher: [
    "/",
    "/profile/:path*",
    "/experiences/:path*",
    "/collection/:path*",
    "/admin/:path*",
    "/checkin/:path*",
    "/unlock/:path*",
    // Live guest screens (GUEST_PROTECTED_* in lib/session-redirect.ts); a test keeps the two in step.
    "/plan",
    "/feedback",
    "/scan",
    "/achievements",
    "/preferences/:path*",
    "/directions/:path*",
    "/places/:path*",
    "/privacy/delete-account",
    "/dev/:path*",
    "/demo/:path*",
    "/map-preview/:path*",
    // Design-review screens (DESIGN_PREVIEW_PREFIXES in lib/development-route-policy.ts); a test keeps the two in step.
    // /plan/unlocked is a live screen under /plan/:path+, and is protected by the same rules.
    "/map/:path*",
    "/route/:path*",
    "/place/:path*",
    "/list/:path*",
    "/next-stop/:path*",
    "/no-match/:path*",
    "/no-stay/:path*",
    "/qr-invalid/:path*",
    "/checked-in/:path*",
    "/ar-unlock/:path*",
    "/unlocked/:path*",
    "/stay/:path*",
    "/permissions/:path*",
    "/guide/:path*",
    "/kit/:path*",
    "/states/:path*",
    "/scan/:path+",
    "/plan/:path+",
    "/achievements/:path+",
  ],
};
