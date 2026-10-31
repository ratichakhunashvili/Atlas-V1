import { mapboxPublicConfig } from "./config";

export const MAPBOX_API_BASE = "https://api.mapbox.com";

/**
 * Fallback only: the initial view FITS Georgia's bounds (see GEORGIA_FIT_BOUNDS), so it frames the country on any
 * screen size. This zoom is not used for the first camera position any more.
 */
export const INITIAL_ZOOM = 6.4;
export const MIN_ZOOM = 4; // a soft zoom-out limit (not a bounds lock); low enough that the Georgia fit is never clamped on narrow phones

/** Padding (px) around Georgia in the initial fit, so the whole country is clearly visible on phones and desktops. */
export const GEORGIA_FIT_PADDING_PX = 24;

/** The tilted view shows less of the country at the same zoom (the near edge is closer), so the fit backs off a little to keep all of Georgia in frame. */
export const PITCH_FIT_MARGIN_ZOOM = 0.1;

/** Padding (px) around a page's focus area (e.g. a sample trip) so the markers and route are not cramped against the edge or the map controls. */
export const FOCUS_FIT_PADDING_PX = 64;

/** Never zoom in closer than this when framing a small focus area. */
export const MAX_FOCUS_ZOOM = 16;

/** How much the fit zooms out per step while Georgia's real outline still falls outside the frame. */
export const FIT_BACKOFF_STEP = 0.05;

/** The 3D view: a moderate tilt, north-up. Stable by design: no auto-rotation, no animation loop. */
export const VIEW_3D_PITCH = 45;
/** A soft ceiling on tilt so a stray gesture can't flip the map to a near-horizontal, unusable view. This is NOT a bounds lock. */
export const MAX_PITCH = 60;
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
