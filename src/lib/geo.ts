export type LatLng = {
  lat: number;
  lng: number;
};

const EARTH_RADIUS_M = 6371000;

/**
 * Haversine distance between two coordinates, in meters. The one canonical
 * distance calculation in Atlas — Map, Advisor, check-in, achievements,
 * hotel radius, and search should all import this rather than re-deriving it.
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * A loose lat/lng bounding box around `center` at `radiusMeters`, for a cheap
 * indexed pre-filter before an exact distanceMeters() pass. Not geodesically
 * exact at the corners — that's fine for narrowing a candidate set.
 */
export function boundingBoxForRadius(
  center: LatLng,
  radiusMeters: number
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const metersPerDegLat = 111320;
  const latRad = (center.lat * Math.PI) / 180;
  const metersPerDegLng = Math.max(1, 111320 * Math.cos(latRad));

  const dLat = radiusMeters / metersPerDegLat;
  const dLng = radiusMeters / metersPerDegLng;

  return {
    minLat: center.lat - dLat,
    maxLat: center.lat + dLat,
    minLng: center.lng - dLng,
    maxLng: center.lng + dLng,
  };
}
