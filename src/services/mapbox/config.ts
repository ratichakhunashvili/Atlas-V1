// Safe to import from client or server code: only the public, domain-restricted
// Mapbox token. The server-only token lives in ./server-config.ts instead.
export const mapboxPublicConfig = {
  accessToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "",
} as const;
