/*
 * Response security headers for every route (wired up in next.config.ts).
 *
 * Kept as a plain module with no imports so next.config.ts can load it and a unit test can assert every header.
 *
 * Why each origin is allowed:
 *  - Mapbox GL JS: api.mapbox.com (styles, sprites, glyphs), *.tiles.mapbox.com (vector tiles), events.mapbox.com
 *    (telemetry). It runs its tile decoding in blob: Web Workers, and builds blob:/data: images and fetches, so
 *    worker-src, child-src, img-src and connect-src include blob:. 'wasm-unsafe-eval' lets WebAssembly compile.
 *  - Vercel Blob (*.vercel-storage.com): hosts the 3D model files (fetched by the map, so connect-src, plus
 *    img-src/media-src) and receives admin model uploads straight from the browser (connect-src).
 *  - img-src https: because admins enter Place photo URLs from any host (see the img tags with that comment).
 *  - Fonts are self-hosted by next/font, so font-src is 'self' and data: only.
 *  - script-src needs 'unsafe-inline' because Next.js emits inline bootstrap scripts and this app does not use a
 *    per-request nonce (a nonce would force every page to render dynamically). No third-party script origin is
 *    allowed. Development adds 'unsafe-eval' (React refresh) and ws: (hot reload) only.
 *  - Auth.js talks to this same origin only, so 'self' covers sign-in and form-action.
 *  - frame-ancestors: /present embeds the app in an iframe of itself, so ordinary routes allow 'self'; the admin
 *    console and API are never framed ('none' / DENY).
 */

export type HeaderRule = { source: string; headers: { key: string; value: string }[] };

const MAPBOX_CONNECT = ["https://api.mapbox.com", "https://events.mapbox.com", "https://*.tiles.mapbox.com"];
const BLOB_HOST = "https://*.vercel-storage.com";

export function buildContentSecurityPolicy({
  isDev,
  frameAncestors,
}: {
  isDev: boolean;
  frameAncestors: "'self'" | "'none'";
}) {
  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https:"],
    "media-src": ["'self'", "blob:", BLOB_HOST],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", "blob:", "data:", ...MAPBOX_CONNECT, BLOB_HOST, ...(isDev ? ["ws:", "wss:"] : [])],
    "worker-src": ["'self'", "blob:"],
    "child-src": ["'self'", "blob:"],
    "frame-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": [frameAncestors],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(" ")}`)
    .join("; ");
}

function headersFor(isDev: boolean, framed: boolean) {
  return [
    {
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy({ isDev, frameAncestors: framed ? "'self'" : "'none'" }),
    },
    { key: "X-Frame-Options", value: framed ? "SAMEORIGIN" : "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    // The map uses location, the QR scanner uses the camera; nothing else needs a sensor or payment.
    { key: "Permissions-Policy", value: "geolocation=(self), camera=(self), microphone=(), payment=(), usb=()" },
  ];
}

export function buildSecurityHeaders({ isDev }: { isDev: boolean }): HeaderRule[] {
  return [
    { source: "/admin/:path*", headers: headersFor(isDev, false) },
    { source: "/api/:path*", headers: headersFor(isDev, false) },
    // Everything else, including /present and the guest screens it frames.
    { source: "/((?!admin/|admin$|api/).*)", headers: headersFor(isDev, true) },
  ];
}
