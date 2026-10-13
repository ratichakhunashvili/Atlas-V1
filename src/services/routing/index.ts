import type { LatLng } from "@/lib/geo";
import { MAPBOX_API_BASE } from "@/services/mapbox/mapTuning";

// Re-exported so callers never need to import the Mapbox config module
// directly — routing owns its own access to it.
export type { LatLng };

// Deliberately NOT a top-level `import "server-only"` + static import of
// mapboxServerConfig here (unlike every other service in Atlas). The
// `server-only` package throws unconditionally outside Next's own bundler —
// not just in a real browser — so a static import of it would make this
// module unloadable under plain `node --test`, not only unsafe in a client
// bundle. Deferring the import to only when a caller doesn't supply an
// explicit `accessToken` (tests always do) keeps real protection intact —
// server-config.ts still throws the instant this path actually runs in a
// browser — while keeping this module testable with zero workarounds.
async function resolveAccessToken(override: string | undefined): Promise<string> {
  if (override !== undefined) return override;
  const { mapboxServerConfig } = await import("@/services/mapbox/server-config");
  return mapboxServerConfig.accessToken;
}

/**
 * The one route-geometry shape used throughout Atlas: a GeoJSON Feature
 * wrapping a LineString, with empty properties. Matches the Feature-always
 * convention services/mapbox/mapTypes.ts already uses for Places
 * (PlaceFeature/PlaceFeatureCollection), so a future AtlasMap route layer can
 * drop this straight into a GeoJSON source with no conversion step.
 */
export type RouteGeometry = GeoJSON.Feature<GeoJSON.LineString, Record<string, never>>;

export type RouteLeg = {
  distanceMeters: number;
  durationSeconds: number;
};

export type OptimizedRoute = {
  /** `stops` reordered into the optimal walking sequence — indices into the `stops` array that was passed in (not including the origin). */
  order: number[];
  geometry: RouteGeometry;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  /** One entry per leg of the optimized trip, in visiting order, if Mapbox provided them. */
  legs: RouteLeg[];
};

export type DirectionsRoute = {
  geometry: RouteGeometry;
  distanceMeters: number;
  durationSeconds: number;
};

/**
 * Flat, specific, no framework: the itinerary layer can match on `reason`
 * when it cares (e.g. retry on "network", surface a message on "no_route"),
 * or just treat any `ok: false` as "no route today" when it doesn't.
 */
export type RoutingFailureReason =
  | "invalid_input"
  | "config"
  | "http"
  | "no_route"
  | "malformed_response"
  | "network";

export type RoutingResult<T> = { ok: true; route: T } | { ok: false; reason: RoutingFailureReason; message: string };

export type RoutingOptions = {
  /** Overrides the configured MAPBOX_SERVER_TOKEN. Exists for tests; production callers should omit this and let it fall back to mapboxServerConfig. */
  accessToken?: string;
};

export function isValidCoordinate(coords: LatLng): boolean {
  return (
    Number.isFinite(coords.lat) &&
    Number.isFinite(coords.lng) &&
    coords.lat >= -90 &&
    coords.lat <= 90 &&
    coords.lng >= -180 &&
    coords.lng <= 180
  );
}

function coordinatesParam(points: readonly LatLng[]): string {
  return points.map((p) => `${p.lng},${p.lat}`).join(";");
}

function toRouteGeometry(geometry: unknown): RouteGeometry | null {
  if (
    typeof geometry !== "object" ||
    geometry === null ||
    (geometry as { type?: unknown }).type !== "LineString" ||
    !Array.isArray((geometry as { coordinates?: unknown }).coordinates)
  ) {
    return null;
  }
  return { type: "Feature", properties: {}, geometry: geometry as GeoJSON.LineString };
}

/**
 * Validates the FULL wrapped Feature shape (what's actually persisted in
 * itineraryDays.routeGeoJson, a plain `jsonb`/`unknown` column) — one level
 * outside what toRouteGeometry checks (that validates the raw LineString
 * before it gets wrapped into a Feature). Any reader pulling routeGeoJson
 * back out of storage should narrow it through this before handing it to
 * Mapbox, since a bad/legacy/null value must never reach source.setData().
 */
export function isValidRouteGeometry(value: unknown): value is RouteGeometry {
  if (typeof value !== "object" || value === null) return false;
  const feature = value as { type?: unknown; geometry?: unknown };
  if (feature.type !== "Feature") return false;
  const geometry = feature.geometry as { type?: unknown; coordinates?: unknown } | undefined;
  return !!geometry && geometry.type === "LineString" && Array.isArray(geometry.coordinates);
}

async function fetchMapboxJson(url: string): Promise<RoutingResult<unknown>> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    return { ok: false, reason: "network", message: "Could not reach Mapbox." };
  }

  if (!response.ok) {
    return { ok: false, reason: "http", message: `Mapbox request failed with status ${response.status}.` };
  }

  try {
    const data: unknown = await response.json();
    return { ok: true, route: data };
  } catch {
    return { ok: false, reason: "malformed_response", message: "Mapbox returned a response that could not be parsed as JSON." };
  }
}

type OptimizationApiResponse = {
  code?: string;
  trips?: Array<{
    geometry?: unknown;
    distance?: number;
    duration?: number;
    legs?: Array<{ distance?: number; duration?: number }>;
  }>;
  waypoints?: Array<{ waypoint_index?: number }>;
};

export type OptimizeWalkingRouteInput = {
  /** The hotel's location — the round trip's anchor, not itself a stop. */
  origin: LatLng;
  stops: LatLng[];
  /** Defaults to true: the hotel is always the anchor, so a generated itinerary returns to it unless a caller explicitly opts out. */
  returnToOrigin?: boolean;
};

/**
 * Solves the walking round trip Hotel -> stops -> Hotel via Mapbox's
 * Optimization API — called once per itinerary generation. Knows nothing
 * about users, hotels, preferences, or persistence; just coordinates in, a
 * route result out. The caller (the later itinerary service) decides what to
 * do with an `ok: false` result — this function never fabricates a fallback
 * route itself.
 */
export async function optimizeWalkingRoute(
  input: OptimizeWalkingRouteInput,
  options: RoutingOptions = {}
): Promise<RoutingResult<OptimizedRoute>> {
  const { origin, stops, returnToOrigin = true } = input;

  if (!isValidCoordinate(origin) || stops.some((stop) => !isValidCoordinate(stop))) {
    return { ok: false, reason: "invalid_input", message: "One or more coordinates are invalid." };
  }
  if (stops.length < 1) {
    return { ok: false, reason: "invalid_input", message: "At least one stop is required to optimize a route." };
  }

  const accessToken = await resolveAccessToken(options.accessToken);
  if (!accessToken) {
    return { ok: false, reason: "config", message: "MAPBOX_SERVER_TOKEN is not configured." };
  }

  const points = [origin, ...stops];
  const roundtripParam = returnToOrigin ? "true" : "false";
  const destinationParam = returnToOrigin ? "" : "&destination=any";
  const url =
    `${MAPBOX_API_BASE}/optimized-trips/v1/mapbox/walking/${coordinatesParam(points)}` +
    `?roundtrip=${roundtripParam}&source=first${destinationParam}&geometries=geojson&overview=full` +
    `&access_token=${accessToken}`;

  const result = await fetchMapboxJson(url);
  if (!result.ok) return result;

  const data = result.route as OptimizationApiResponse;
  if (data.code && data.code !== "Ok") {
    return { ok: false, reason: "no_route", message: `Mapbox could not find a route (${data.code}).` };
  }

  const trip = data.trips?.[0];
  const waypoints = data.waypoints;
  if (!trip || !waypoints || waypoints.length !== points.length) {
    return { ok: false, reason: "no_route", message: "Mapbox returned no usable trip." };
  }

  const geometry = toRouteGeometry(trip.geometry);
  if (!geometry || typeof trip.distance !== "number" || typeof trip.duration !== "number") {
    return { ok: false, reason: "malformed_response", message: "Mapbox's trip response is missing required fields." };
  }

  // `waypoint_index` is the trip's visiting position for each INPUT point
  // (index 0 = origin). Re-sort by that to get input indices in visiting
  // order, then drop the origin and shift back to index into `stops`.
  const visitingOrder = waypoints
    .map((waypoint, inputIndex) => ({ inputIndex, tripPosition: waypoint.waypoint_index ?? 0 }))
    .sort((a, b) => a.tripPosition - b.tripPosition)
    .map((entry) => entry.inputIndex);
  const order = visitingOrder.filter((index) => index !== 0).map((index) => index - 1);

  const legs: RouteLeg[] = (trip.legs ?? []).map((leg) => ({
    distanceMeters: leg.distance ?? 0,
    durationSeconds: leg.duration ?? 0,
  }));

  return {
    ok: true,
    route: {
      order,
      geometry,
      totalDistanceMeters: trip.distance,
      totalDurationSeconds: trip.duration,
      legs,
    },
  };
}

type DirectionsApiResponse = {
  code?: string;
  routes?: Array<{ geometry?: unknown; distance?: number; duration?: number }>;
};

export type WalkingDirectionsInput = {
  origin: LatLng;
  destination: LatLng;
};

/**
 * A single point-to-point walking route via Mapbox's Directions API — shows
 * just the leg to the guest's current unvisited stop. Deliberately separate
 * from optimizeWalkingRoute: re-running the full itinerary optimization to
 * show one leg would be wasteful and could silently reorder an
 * already-committed stop sequence.
 */
export async function getWalkingDirections(
  input: WalkingDirectionsInput,
  options: RoutingOptions = {}
): Promise<RoutingResult<DirectionsRoute>> {
  const { origin, destination } = input;

  if (!isValidCoordinate(origin) || !isValidCoordinate(destination)) {
    return { ok: false, reason: "invalid_input", message: "One or more coordinates are invalid." };
  }

  const accessToken = await resolveAccessToken(options.accessToken);
  if (!accessToken) {
    return { ok: false, reason: "config", message: "MAPBOX_SERVER_TOKEN is not configured." };
  }

  const url =
    `${MAPBOX_API_BASE}/directions/v5/mapbox/walking/${coordinatesParam([origin, destination])}` +
    `?geometries=geojson&overview=full&access_token=${accessToken}`;

  const result = await fetchMapboxJson(url);
  if (!result.ok) return result;

  const data = result.route as DirectionsApiResponse;
  if (data.code && data.code !== "Ok") {
    return { ok: false, reason: "no_route", message: `Mapbox could not find a route (${data.code}).` };
  }

  const route = data.routes?.[0];
  if (!route) {
    return { ok: false, reason: "no_route", message: "Mapbox returned no usable route." };
  }

  const geometry = toRouteGeometry(route.geometry);
  if (!geometry || typeof route.distance !== "number" || typeof route.duration !== "number") {
    return { ok: false, reason: "malformed_response", message: "Mapbox's route response is missing required fields." };
  }

  return { ok: true, route: { geometry, distanceMeters: route.distance, durationSeconds: route.duration } };
}
