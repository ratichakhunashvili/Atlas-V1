import type { Map as MapboxMap, ExpressionSpecification } from "mapbox-gl";
import type { ThemeDefinition } from "../mapTypes";

export const BUILDINGS_LAYER_ID = "buildings-3d";

const MIN_HEIGHT_M = 3;
const DEFAULT_HEIGHT_M = 6;
/** Caps absurd/bad tileset values so one tall outlier doesn't dominate the skyline. */
const MAX_HEIGHT_M = 120;
const MAX_BASE_M = 100;

function findFirstSymbolLayerId(map: MapboxMap): string | undefined {
  const layers = map.getStyle()?.layers ?? [];
  return layers.find((layer) => layer.type === "symbol")?.id;
}

function heightExpression(minZoom: number): ExpressionSpecification {
  const clamped: ExpressionSpecification = [
    "min",
    ["max", ["coalesce", ["get", "height"], DEFAULT_HEIGHT_M], MIN_HEIGHT_M],
    MAX_HEIGHT_M,
  ];
  return ["interpolate", ["linear"], ["zoom"], minZoom, 0, minZoom + 0.6, clamped];
}

function baseExpression(minZoom: number): ExpressionSpecification {
  const clamped: ExpressionSpecification = ["min", ["coalesce", ["get", "min_height"], 0], MAX_BASE_M];
  return ["interpolate", ["linear"], ["zoom"], minZoom, 0, minZoom + 0.6, clamped];
}

/**
 * Simple low-detail building blocks, sourced straight from Mapbox's own
 * streets vector tiles (`composite` source, `building` source-layer) instead
 * of a hand-rolled GeoJSON of every building. Gated behind `minZoom` so the
 * GPU never pays for extrusions the user can't benefit from at a zoomed-out view.
 */
export function addBuildingsLayer(map: MapboxMap, theme: ThemeDefinition, minZoom: number): void {
  if (map.getLayer(BUILDINGS_LAYER_ID)) return;

  map.addLayer(
    {
      id: BUILDINGS_LAYER_ID,
      type: "fill-extrusion",
      source: "composite",
      "source-layer": "building",
      minzoom: minZoom,
      filter: ["==", ["get", "extrude"], "true"],
      paint: {
        "fill-extrusion-color": theme.building.color,
        "fill-extrusion-height": heightExpression(minZoom),
        "fill-extrusion-base": baseExpression(minZoom),
        "fill-extrusion-opacity": theme.building.opacity,
      },
    },
    findFirstSymbolLayerId(map)
  );
}

export function updateBuildingsTheme(map: MapboxMap, theme: ThemeDefinition): void {
  if (!map.getLayer(BUILDINGS_LAYER_ID)) return;
  map.setPaintProperty(BUILDINGS_LAYER_ID, "fill-extrusion-color", theme.building.color);
  map.setPaintProperty(BUILDINGS_LAYER_ID, "fill-extrusion-opacity", theme.building.opacity);
}

export function setBuildingsMinZoom(map: MapboxMap, minZoom: number): void {
  if (!map.getLayer(BUILDINGS_LAYER_ID)) return;
  map.setLayerZoomRange(BUILDINGS_LAYER_ID, minZoom, 24);
  map.setPaintProperty(BUILDINGS_LAYER_ID, "fill-extrusion-height", heightExpression(minZoom));
  map.setPaintProperty(BUILDINGS_LAYER_ID, "fill-extrusion-base", baseExpression(minZoom));
}
