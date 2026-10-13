import type { Map as MapboxMap, GeoJSONSource } from "mapbox-gl";
import type { ThemeDefinition } from "../mapTypes";
import type { RouteGeometry } from "@/services/routing";

const EMPTY_LINE: RouteGeometry = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } };

export const ROUTE_SOURCE_ID = "atlas-advisor-route";
export const ROUTE_LINE_LAYER_ID = "atlas-advisor-route-line";

/**
 * The Advisor's persisted itinerary route — a single GeoJSON line source and
 * layer, the same "one source, GPU-drawn" convention placesLayer.ts already
 * uses, never a second Mapbox instance or a DOM-drawn path. Re-added inside
 * MapService.addCustomLayers() on every style/theme change (setStyle() wipes
 * all sources/layers), so theme.accent is always whatever theme is current
 * at that moment — no separate "update theme" function needed here.
 */
export function addRouteLayer(map: MapboxMap, theme: ThemeDefinition): void {
  if (!map.getSource(ROUTE_SOURCE_ID)) {
    map.addSource(ROUTE_SOURCE_ID, { type: "geojson", data: EMPTY_LINE });
  }

  if (!map.getLayer(ROUTE_LINE_LAYER_ID)) {
    map.addLayer({
      id: ROUTE_LINE_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: { "line-join": "round", "line-cap": "round" },
      paint: {
        "line-color": theme.accent,
        "line-width": 4,
        "line-opacity": 0.85,
      },
    });
  }
}

export function setRouteData(map: MapboxMap, geometry: RouteGeometry | null): void {
  const source = map.getSource(ROUTE_SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(geometry ?? EMPTY_LINE);
}
