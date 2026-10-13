import type { Map as MapboxMap } from "mapbox-gl";
import type { ThemeDefinition } from "../mapTypes";
import { buildOutsideMask } from "../georgiaBoundary";

const SOURCE_ID = "georgia-outside-mask";
const LAYER_ID = "georgia-outside-mask-fill";

/**
 * Dims everything outside Georgia with one cheap fill layer (a rectangle with
 * Georgia punched out as a hole — a couple dozen vertices total) instead of
 * loading or styling any real data for neighboring countries. This is a
 * visual effect only, not the performance safeguard — see georgiaBoundary.ts.
 */
export function addMaskLayer(map: MapboxMap, theme: ThemeDefinition): void {
  if (!map.getSource(SOURCE_ID)) {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: buildOutsideMask(),
    });
  }

  if (!map.getLayer(LAYER_ID)) {
    map.addLayer({
      id: LAYER_ID,
      type: "fill",
      source: SOURCE_ID,
      paint: {
        "fill-color": theme.mask.color,
        "fill-opacity": theme.mask.opacity,
      },
    });
  }
}

export function updateMaskTheme(map: MapboxMap, theme: ThemeDefinition): void {
  if (!map.getLayer(LAYER_ID)) return;
  map.setPaintProperty(LAYER_ID, "fill-color", theme.mask.color);
  map.setPaintProperty(LAYER_ID, "fill-opacity", theme.mask.opacity);
}
