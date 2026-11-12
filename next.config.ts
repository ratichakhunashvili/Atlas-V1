import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // CSP, framing, referrer, nosniff and permissions headers: see src/lib/security-headers.ts for the allowed origins.
  async headers() {
    return buildSecurityHeaders({ isDev: process.env.NODE_ENV !== "production" });
  },
  experimental: {
    // Keep each guest screen in the browser for 30 s after a visit, so switching between tabs
    // (Missions ↔ My plan ↔ Profile) shows the screen at once instead of asking the server again.
    // Every action that changes guest data calls revalidatePath("/", "layout"), which drops this
    // cache, so a new check-in or badge is never hidden behind a cached screen.
    staleTimes: { dynamic: 30 },
  },
  // Cache Components (PPR) intentionally left off for Phase 1: nearly every
  // route is auth-gated/dynamic, so there is no static shell to benefit from
  // it yet. Revisit in the Map phase once public Place listings are cacheable.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
