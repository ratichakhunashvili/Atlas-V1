import "server-only";

// Importing this from a 'use client' component is a build error by design —
// that is what keeps the server-restricted Mapbox token off the client.
export const mapboxServerConfig = {
  accessToken: process.env.MAPBOX_SERVER_TOKEN ?? "",
} as const;
