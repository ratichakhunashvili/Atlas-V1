import type { Map as MapboxMap } from "mapbox-gl/esm";

/*
 * Recolours Mapbox's light style with the palette of the Figma map art:
 *   land #E6DCCD · water #C3D6D2 · parks #D3D8C6 · streets #F6F3ED
 * Labels are softened to the design's slate, and Mapbox's own points of interest are hidden:
 * Atlas only ever shows places its database says the guest's hotel has approved, so a generic
 * Mapbox POI must never look like a recommendation.
 */

export const MAP_STYLE_URL = "mapbox://styles/mapbox/light-v11";

const LAND = "#e6dccd";
const WATER = "#c3d6d2";
const PARK = "#d3d8c6";
const STREET = "#f6f3ed";
const BUILDING = "#ddd1c1";
const LABEL = "#4a5757";

function setPaint(map: MapboxMap, id: string, property: string, value: unknown) {
  try {
    map.setPaintProperty(id, property as never, value as never);
  } catch {
    // A layer may not support the property; leaving Mapbox's own value is harmless.
  }
}

export function applyAtlasPalette(map: MapboxMap): void {
  const layers = map.getStyle()?.layers ?? [];

  for (const layer of layers) {
    const id = layer.id;

    if (layer.type === "background") {
      setPaint(map, id, "background-color", LAND);
      continue;
    }

    if (layer.type === "symbol") {
      if (/poi|transit|airport|natural-point|ferry/.test(id)) {
        map.setLayoutProperty(id, "visibility", "none");
      } else {
        setPaint(map, id, "text-color", LABEL);
        setPaint(map, id, "text-halo-color", STREET);
      }
      continue;
    }

    if (layer.type === "fill") {
      if (/water/.test(id)) setPaint(map, id, "fill-color", WATER);
      else if (/park|landuse|landcover|national|pitch|golf|wood|grass/.test(id)) setPaint(map, id, "fill-color", PARK);
      else if (/building/.test(id)) setPaint(map, id, "fill-color", BUILDING);
      else if (/land|aeroway/.test(id)) setPaint(map, id, "fill-color", LAND);
      continue;
    }

    if (layer.type === "line") {
      if (/water/.test(id)) setPaint(map, id, "line-color", WATER);
      else if (/road|street|bridge|tunnel|path|pedestrian|steps|track/.test(id)) setPaint(map, id, "line-color", STREET);
      else if (/admin|boundary/.test(id)) setPaint(map, id, "line-opacity", 0.25);
    }
  }
}

/** Soft 3D buildings in the sand tone, shown when the map is tilted. */
export function addBuildingExtrusions(map: MapboxMap): void {
  if (map.getLayer("atlas-buildings-3d") || !map.getSource("composite")) return;
  map.addLayer({
    id: "atlas-buildings-3d",
    type: "fill-extrusion",
    source: "composite",
    "source-layer": "building",
    filter: ["==", ["get", "extrude"], "true"],
    minzoom: 13,
    paint: {
      "fill-extrusion-color": BUILDING,
      "fill-extrusion-height": ["get", "height"],
      "fill-extrusion-base": ["get", "min_height"],
      "fill-extrusion-opacity": 0.55,
    },
  });
}
