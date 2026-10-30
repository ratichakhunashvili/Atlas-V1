import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth/config";
import { shouldBlockDevelopmentOnlyPath } from "@/lib/development-route-policy";

// Separate, edge-safe NextAuth() call (shares authConfig with src/auth/index.ts
// but omits the Node-only Credentials provider) so this proxy never bundles
// db/bcrypt code for the Edge runtime.
const { auth } = NextAuth(authConfig);

const PROTECTED_EXACT = ["/"];
const PROTECTED_PREFIXES = ["/profile", "/hotels", "/experiences", "/collection", "/admin", "/checkin"];

function isProtectedPath(pathname: string) {
  return (
    PROTECTED_EXACT.includes(pathname) ||
    PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

// This is an optimistic, UX-only check (redirect early, no flash of
// protected content). It is NOT the authorization boundary: every admin
// page re-checks with requireAdmin() in its layout, and every mutating
// server action re-checks again before touching the database.
export default auth((req) => {
  const { pathname } = req.nextUrl;

  if (shouldBlockDevelopmentOnlyPath(pathname, process.env.NODE_ENV, process.env.ATLAS_DEPLOYMENT_ENV)) {
    return new NextResponse(null, { status: 404 });
  }

  if (isProtectedPath(pathname) && !req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/admin") && req.auth && req.auth.user.role !== "admin") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }
});

export const config = {
  matcher: [
    "/",
    "/profile/:path*",
    "/hotels/:path*",
    "/experiences/:path*",
    "/collection/:path*",
    "/admin/:path*",
    "/checkin/:path*",
    "/dev/:path*",
    "/demo/:path*",
    "/map-preview/:path*",
  ],
};
