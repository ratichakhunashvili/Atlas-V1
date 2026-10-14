import type { Map as MapboxMap, GeoJSONSource, ExpressionSpecification } from "mapbox-gl";
import type { AdvisorStopStatus } from "@/services/advisor/current-itinerary";

export type ItineraryStopFeatureProperties = {
  id: string;
  status: AdvisorStopStatus;
  label: string;
};

export type ItineraryStopFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Point, ItineraryStopFeatureProperties>;

export const ITINERARY_STOPS_SOURCE_ID = "atlas-advisor-stops";
export const ITINERARY_STOPS_CIRCLE_LAYER_ID = "atlas-advisor-stops-circles";
const LABEL_LAYER_ID = "atlas-advisor-stops-labels";

const EMPTY_COLLECTION: ItineraryStopFeatureCollection = { type: "FeatureCollection", features: [] };

// Fixed, not theme-derived — status colors (green/blue/gray) read clearly on
// both the light and dark Mapbox styles without needing a second themed
// palette, unlike placesLayer's per-category colors.
const STATUS_COLOR: ExpressionSpecification = [
  "match",
  ["get", "status"],
  "completed",
  "#16a34a",
  "current",
  "#2563eb",
  "unavailable",
  "#d97706", // amber: the stop's partnership/facility is no longer eligible (the only Mapbox change in the check-in phase)
  "#94a3b8", // upcoming (and any unrecognized value, as a safe fallback)
] as unknown as ExpressionSpecification;

const RADIUS: ExpressionSpecification = ["match", ["get", "status"], "current", 10, 8] as unknown as ExpressionSpecification;

/**
 * The itinerary's own small set of stops — a separate GeoJSON source/layer
 * from placesLayer.ts's general Place circles, so the normal Places layer
 * (hundreds of rows, category-colored) is never touched by Advisor state.
 * Only a handful of features exist here at once (one itinerary's stops), so
 * this stays cheap even though it's a second circle layer.
 */
export function addItineraryStopsLayer(map: MapboxMap): void {
  if (!map.getSource(ITINERARY_STOPS_SOURCE_ID)) {
    map.addSource(ITINERARY_STOPS_SOURCE_ID, { type: "geojson", data: EMPTY_COLLECTION, promoteId: "id" });
  }

  if (!map.getLayer(ITINERARY_STOPS_CIRCLE_LAYER_ID)) {
    map.addLayer({
      id: ITINERARY_STOPS_CIRCLE_LAYER_ID,
      type: "circle",
      source: ITINERARY_STOPS_SOURCE_ID,
      paint: {
        "circle-radius": RADIUS,
        "circle-color": STATUS_COLOR,
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
      },
    });
  }

  if (!map.getLayer(LABEL_LAYER_ID)) {
    map.addLayer({
      id: LABEL_LAYER_ID,
      type: "symbol",
      source: ITINERARY_STOPS_SOURCE_ID,
      layout: {
        "text-field": ["get", "label"],
        "text-size": 10,
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
      paint: {
        "text-color": "#ffffff",
      },
    });
  }
}

export function setItineraryStopsData(map: MapboxMap, collection: ItineraryStopFeatureCollection): void {
  const source = map.getSource(ITINERARY_STOPS_SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(collection);
}
