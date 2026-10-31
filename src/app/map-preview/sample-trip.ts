/**
 * DEMO-ONLY sample itinerary for the development map preview.
 *
 * These are isolated, made-up stops placed on ordinary streets in central Tbilisi purely so a road-following route
 * can be seen. They are NOT real businesses, NOT hotel partners, and NOT recommendations: nothing here is read from
 * or written to the database, and none of it goes through (or changes) Atlas's eligibility logic. Mapbox is used only
 * to ROUTE between these fixed points, never to search for or choose places.
 */

export type DemoPoint = {
  id: string;
  /** Always labelled as a demo so it can never be mistaken for a real place. */
  name: string;
  latitude: number;
  longitude: number;
};

export const DEMO_HOTEL: DemoPoint = {
  id: "00000000-0000-4000-8000-0000000d0001",
  name: "Demo Hotel (sample — not a real hotel)",
  latitude: 41.6903,
  longitude: 44.8086,
};

/** Visited in this exact order: hotel -> stop 1 -> stop 2 -> stop 3 -> hotel. */
export const DEMO_STOPS: readonly DemoPoint[] = [
  { id: "00000000-0000-4000-8000-0000000d0011", name: "Demo Stop 1 (sample location)", latitude: 41.6934, longitude: 44.8014 },
  { id: "00000000-0000-4000-8000-0000000d0012", name: "Demo Stop 2 (sample location)", latitude: 41.7011, longitude: 44.7984 },
  { id: "00000000-0000-4000-8000-0000000d0013", name: "Demo Stop 3 (sample location)", latitude: 41.6956, longitude: 44.8112 },
];

export const DEMO_DISCLAIMER = "Demo-only sample locations. Not real businesses and not hotel partners.";

export type TripBounds = [[number, number], [number, number]];

/** The smallest [[west, south], [east, north]] box containing every point of the trip. Used to frame the camera on the sample route. */
export function tripBounds(points: ReadonlyArray<Pick<DemoPoint, "latitude" | "longitude">>): TripBounds {
  if (points.length === 0) throw new Error("tripBounds needs at least one point");
  const lons = points.map((p) => p.longitude);
  const lats = points.map((p) => p.latitude);
  return [
    [Math.min(...lons), Math.min(...lats)],
    [Math.max(...lons), Math.max(...lats)],
  ];
}

export const DEMO_TRIP_BOUNDS: TripBounds = tripBounds([DEMO_HOTEL, ...DEMO_STOPS]);

/** "2.3 km" / "850 m". */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** "42 min" / "1 h 05 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${String(minutes % 60).padStart(2, "0")} min`;
}
