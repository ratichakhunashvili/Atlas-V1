import type { Coordinates } from "./mapTypes";

/** Geodesic circle approximated as a polygon — accurate at any zoom, unlike a pixel-radius circle layer. Used for the GPS accuracy ring. */
export function circlePolygon(
  center: Coordinates,
  radiusMeters: number,
  points = 32
): GeoJSON.Feature<GeoJSON.Polygon> {
  const coords: Array<[number, number]> = [];
  const latRad = (center.lat * Math.PI) / 180;
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos(latRad);

  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dx = (radiusMeters * Math.cos(angle)) / metersPerDegLng;
    const dy = (radiusMeters * Math.sin(angle)) / metersPerDegLat;
    coords.push([center.lng + dx, center.lat + dy]);
  }

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

export function boundingBoxOf(
  ring: Array<[number, number]>
): { west: number; south: number; east: number; north: number } {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const [lng, lat] of ring) {
    if (lng < west) west = lng;
    if (lng > east) east = lng;
    if (lat < south) south = lat;
    if (lat > north) north = lat;
  }

  return { west, south, east, north };
}
