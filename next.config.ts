import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
