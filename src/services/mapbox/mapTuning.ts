import { mapboxPublicConfig } from "./config";

export const MAPBOX_API_BASE = "https://api.mapbox.com";

export const INITIAL_ZOOM = 6.4;
export const MIN_ZOOM = 5;
export const MAX_ZOOM = 19.5;

/** Below this zoom we don't bother fetching or drawing Places — the user is looking at the whole country, not a neighborhood. */
export const PLACES_MIN_ZOOM = 12;

/** Zoom at which building extrusions start to appear at all. */
export const BUILDINGS_BASE_MIN_ZOOM = 14;

/** Re-center the user-location marker only after it moved this far (avoids GPS jitter redraws). */
export const LOCATION_MARKER_THRESHOLD_M = 12;

/** How much a selected Place's circle grows in 3D (pitched) mode. 1.12 = +12%. */
export const SELECTION_GROW_FACTOR = 1.12;

/** Duration of the selection grow/shrink + highlight transition. Mapbox interpolates this natively via paint-property transitions — no JS animation loop involved. */
export const SELECTION_TRANSITION_MS = 220;

/** The radius narrowed to once the browser's real GPS position resolves (Step 12). */
export const NEARBY_RADIUS_M = 5000;

export function assertMapboxToken(): void {
  if (!mapboxPublicConfig.accessToken) {
    throw new Error(
      "Missing NEXT_PUBLIC_MAPBOX_TOKEN. Set it in .env.local (see .env.example)."
    );
  }
}
