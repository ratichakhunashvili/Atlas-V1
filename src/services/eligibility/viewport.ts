import { distanceMeters, type LatLng } from "@/lib/geo";
import type { EligiblePlace } from "./rules";

/**
 * The map's visible area (catalogue plan §4, phase C3). Pure: no DB. The catalogue is city-wide, so the map loads only
 * the Places inside the current viewport, and never more than MAP_RESULT_CAP of them. Like every other filter, an area
 * can only NARROW the already-eligible set; it never makes a Place eligible.
 */
export type MapBounds = { south: number; west: number; north: number; east: number };

/** The most Places one map request returns. Enough for a dense city view; small enough for a mid-range phone. */
export const MAP_RESULT_CAP = 200;

/** The largest area one request may ask for, in degrees per side (~55 km of latitude): the 50 km radius bound, as a box. */
export const MAX_BOUNDS_SPAN_DEGREES = 0.5;

/** A box around a point, for the first render before the browser reports its real viewport. */
export function boundsAround(center: LatLng, halfSpanDegrees: number): MapBounds {
  return {
    south: center.lat - halfSpanDegrees,
    north: center.lat + halfSpanDegrees,
    west: center.lng - halfSpanDegrees,
    east: center.lng + halfSpanDegrees,
  };
}

export function boundsCenter(bounds: MapBounds): LatLng {
  return { lat: (bounds.south + bounds.north) / 2, lng: (bounds.west + bounds.east) / 2 };
}

/**
 * Shrinks an oversized (or inverted) box to at most MAX_BOUNDS_SPAN_DEGREES per side around its centre, so a
 * zoomed-out or forged request cannot ask for the whole catalogue at once.
 */
export function clampBounds(bounds: MapBounds): MapBounds {
  const south = Math.min(bounds.south, bounds.north);
  const north = Math.max(bounds.south, bounds.north);
  const west = Math.min(bounds.west, bounds.east);
  const east = Math.max(bounds.west, bounds.east);
  const center = { lat: (south + north) / 2, lng: (west + east) / 2 };
  const halfLat = Math.min(north - south, MAX_BOUNDS_SPAN_DEGREES) / 2;
  const halfLng = Math.min(east - west, MAX_BOUNDS_SPAN_DEGREES) / 2;
  return { south: center.lat - halfLat, north: center.lat + halfLat, west: center.lng - halfLng, east: center.lng + halfLng };
}

export function isWithinBounds(point: LatLng, bounds: MapBounds): boolean {
  return point.lat >= bounds.south && point.lat <= bounds.north && point.lng >= bounds.west && point.lng <= bounds.east;
}

/**
 * The Places of an already-eligible set that fall inside the area, nearest the area's centre first, cut at the cap.
 * The hotel's own facilities are kept ahead of the cap: there are few of them and the guest always expects them.
 */
export function selectForViewport(
  places: readonly EligiblePlace[],
  bounds: MapBounds,
  cap: number = MAP_RESULT_CAP
): { places: EligiblePlace[]; truncated: boolean } {
  const center = boundsCenter(bounds);
  const inside = places
    .filter((entry) => isWithinBounds({ lat: entry.place.latitude, lng: entry.place.longitude }, bounds))
    .map((entry) => ({ entry, distance: distanceMeters(center, { lat: entry.place.latitude, lng: entry.place.longitude }) }))
    .sort((a, b) => Number(b.entry.source === "facility") - Number(a.entry.source === "facility") || a.distance - b.distance)
    .map(({ entry }) => entry);
  return { places: inside.slice(0, cap), truncated: inside.length > cap };
}
