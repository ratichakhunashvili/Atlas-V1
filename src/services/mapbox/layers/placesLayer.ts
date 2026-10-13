import type { Map as MapboxMap, GeoJSONSource, ExpressionSpecification } from "mapbox-gl";
import type { PlaceFeatureCollection, SelectionMode, ThemeDefinition } from "../mapTypes";
import { SELECTION_GROW_FACTOR, SELECTION_TRANSITION_MS } from "../mapTuning";

export const PLACES_SOURCE_ID = "atlas-places";
export const PLACES_CIRCLE_LAYER_ID = "atlas-places-circles";
const LABEL_LAYER_ID = "atlas-places-labels";

const EMPTY_COLLECTION: PlaceFeatureCollection = { type: "FeatureCollection", features: [] };

const PREFERS_REDUCED_MOTION =
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const TRANSITION = { duration: PREFERS_REDUCED_MOTION ? 0 : SELECTION_TRANSITION_MS, delay: 0 };

/** `['feature-state', 'selectMode']` is null until a feature is ever selected — coalesce to a concrete default so `match` always has a string to compare. */
const SELECT_MODE_STATE: ExpressionSpecification = ["coalesce", ["feature-state", "selectMode"], "none"];

function categoryColorExpression(theme: ThemeDefinition): ExpressionSpecification {
  const stops = Object.entries(theme.place.categories).flatMap(([category, color]) => [category, color]);
  return ["match", ["get", "category"], ...stops, theme.place.default] as unknown as ExpressionSpecification;
}

function radiusExpression(minZoom: number): ExpressionSpecification {
  const grown = (base: number): ExpressionSpecification =>
    ["match", SELECT_MODE_STATE, "3d", base * SELECTION_GROW_FACTOR, base] as unknown as ExpressionSpecification;

  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    minZoom,
    grown(3.5),
    minZoom + 4,
    grown(6),
  ] as unknown as ExpressionSpecification;
}

function strokeWidthExpression(): ExpressionSpecification {
  return ["match", SELECT_MODE_STATE, "none", 1, 2.5] as unknown as ExpressionSpecification;
}

function strokeColorExpression(theme: ThemeDefinition): ExpressionSpecification {
  return ["match", SELECT_MODE_STATE, "none", theme.place.halo, theme.accent] as unknown as ExpressionSpecification;
}

/**
 * Renders Atlas Places through a single GeoJSON source and two layers
 * (circles + labels) — never one DOM marker per place. Scales to hundreds or
 * thousands of rows because the GPU, not the DOM, owns the per-feature cost.
 * Both layers are zoom-gated so the map stays clean when zoomed out.
 */
export function addPlacesLayer(map: MapboxMap, theme: ThemeDefinition, minZoom: number): void {
  if (!map.getSource(PLACES_SOURCE_ID)) {
    map.addSource(PLACES_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_COLLECTION,
      // GeoJSON sources don't reliably carry a top-level *string* feature id
      // through to queryRenderedFeatures/feature-state — promoteId tells
      // Mapbox to use this property as the feature's identity instead, which
      // does support strings. Atlas Place ids are UUID strings, so this is
      // what makes selection targetable at all.
      promoteId: "id",
    });
  }

  if (!map.getLayer(PLACES_CIRCLE_LAYER_ID)) {
    map.addLayer({
      id: PLACES_CIRCLE_LAYER_ID,
      type: "circle",
      source: PLACES_SOURCE_ID,
      minzoom: minZoom,
      paint: {
        "circle-radius": radiusExpression(minZoom),
        "circle-radius-transition": TRANSITION,
        "circle-color": categoryColorExpression(theme),
        "circle-stroke-width": strokeWidthExpression(),
        "circle-stroke-width-transition": TRANSITION,
        "circle-stroke-color": strokeColorExpression(theme),
        "circle-stroke-color-transition": TRANSITION,
      },
    });
  }

  if (!map.getLayer(LABEL_LAYER_ID)) {
    map.addLayer({
      id: LABEL_LAYER_ID,
      type: "symbol",
      source: PLACES_SOURCE_ID,
      minzoom: minZoom + 2,
      layout: {
        "text-field": ["get", "name"],
        "text-size": 11,
        "text-offset": [0, 1.1],
        "text-anchor": "top",
        "text-optional": true,
      },
      paint: {
        "text-color": theme.text,
        "text-halo-color": theme.place.halo,
        "text-halo-width": 1,
      },
    });
  }
}

export function setPlacesData(map: MapboxMap, collection: PlaceFeatureCollection): void {
  const source = map.getSource(PLACES_SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(collection);
}

export function updatePlacesTheme(map: MapboxMap, theme: ThemeDefinition): void {
  if (map.getLayer(PLACES_CIRCLE_LAYER_ID)) {
    map.setPaintProperty(PLACES_CIRCLE_LAYER_ID, "circle-color", categoryColorExpression(theme));
    map.setPaintProperty(PLACES_CIRCLE_LAYER_ID, "circle-stroke-color", strokeColorExpression(theme));
  }
  if (map.getLayer(LABEL_LAYER_ID)) {
    map.setPaintProperty(LABEL_LAYER_ID, "text-color", theme.text);
    map.setPaintProperty(LABEL_LAYER_ID, "text-halo-color", theme.place.halo);
  }
}

/**
 * Selection is pure feature-state — no setData, no new layers, no DOM.
 * Mapbox re-evaluates the affected feature's paint output and, because the
 * paint properties above declare a `-transition`, interpolates to it smoothly
 * on its own timer. There is no JS animation loop on our side at all.
 */
export function setPlaceSelection(map: MapboxMap, featureId: string, mode: SelectionMode): void {
  map.setFeatureState({ source: PLACES_SOURCE_ID, id: featureId }, { selectMode: mode });
}

export function clearPlaceSelection(map: MapboxMap, featureId: string): void {
  map.setFeatureState({ source: PLACES_SOURCE_ID, id: featureId }, { selectMode: "none" });
}
