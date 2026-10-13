import type { Map as MapboxMap, MapMouseEvent } from "mapbox-gl";
import { PLACES_CIRCLE_LAYER_ID, setPlaceSelection, clearPlaceSelection } from "./layers/placesLayer";
import { ITINERARY_STOPS_CIRCLE_LAYER_ID } from "./layers/itineraryStopsLayer";
import type { SelectionMode } from "./mapTypes";

function currentMode(map: MapboxMap): SelectionMode {
  return map.getPitch() > 0.5 ? "3d" : "2d";
}

/**
 * Wires map clicks/taps to a React-level selection callback and keeps the
 * clicked Place's feature-state (and therefore its grow/highlight animation)
 * in sync. Only one `click`, one `pitchend`, and a pair of hover listeners are
 * registered — once, for the lifetime of the map — never per-click or per-feature.
 *
 * The map engine never holds the selected Place object itself, only its id —
 * `onSelect` is the bridge back to React state, where the authoritative Place
 * data (from the server) lives.
 */
export function attachPlaceSelection(
  map: MapboxMap,
  onSelect: (placeId: string | null) => void
): () => void {
  let selectedFeatureId: string | null = null;

  const applyToMap = (nextId: string | null): void => {
    if (selectedFeatureId !== null && selectedFeatureId !== nextId) {
      clearPlaceSelection(map, selectedFeatureId);
    }
    if (nextId !== null) {
      setPlaceSelection(map, nextId, currentMode(map));
    }
    selectedFeatureId = nextId;
  };

  const handleClick = (event: MapMouseEvent): void => {
    const hits = map.queryRenderedFeatures(event.point, { layers: [PLACES_CIRCLE_LAYER_ID] });
    const hit = hits[0];
    const nextId = hit && hit.id !== undefined ? String(hit.id) : null;
    applyToMap(nextId);
    onSelect(nextId);
  };

  // Re-sync the already-selected feature's mode when the camera tilt changes
  // (e.g. selected in 3D, then the user flattens the view back to 2D).
  const handlePitchEnd = (): void => {
    if (selectedFeatureId !== null) applyToMap(selectedFeatureId);
  };

  const handleMouseEnter = (): void => {
    map.getCanvas().style.cursor = "pointer";
  };
  const handleMouseLeave = (): void => {
    map.getCanvas().style.cursor = "";
  };

  const handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      applyToMap(null);
      onSelect(null);
    }
  };

  map.on("click", handleClick);
  map.on("pitchend", handlePitchEnd);
  map.on("mouseenter", PLACES_CIRCLE_LAYER_ID, handleMouseEnter);
  map.on("mouseleave", PLACES_CIRCLE_LAYER_ID, handleMouseLeave);
  document.addEventListener("keydown", handleKeyDown);

  return () => {
    map.off("click", handleClick);
    map.off("pitchend", handlePitchEnd);
    map.off("mouseenter", PLACES_CIRCLE_LAYER_ID, handleMouseEnter);
    map.off("mouseleave", PLACES_CIRCLE_LAYER_ID, handleMouseLeave);
    document.removeEventListener("keydown", handleKeyDown);
  };
}

/** Clears the selection's feature-state directly, for when React deselects a Place that's no longer in the data (e.g. deleted, or panned out of range) without a corresponding map click. */
export function externallyDeselect(map: MapboxMap, previousId: string | null): void {
  if (previousId !== null) clearPlaceSelection(map, previousId);
}

/**
 * Separate from attachPlaceSelection: tapping an itinerary stop only tells
 * the Advisor sheet "focus/scroll to this one" (point 15) — it never
 * changes which stop is check-in eligible, so there's no feature-state
 * grow/highlight animation or keyboard-escape handling to wire up here,
 * just a plain click -> callback.
 */
export function attachItineraryStopSelection(map: MapboxMap, onSelect: (stopId: string) => void): () => void {
  const handleClick = (event: MapMouseEvent): void => {
    const hits = map.queryRenderedFeatures(event.point, { layers: [ITINERARY_STOPS_CIRCLE_LAYER_ID] });
    const hit = hits[0];
    if (hit?.id !== undefined) onSelect(String(hit.id));
  };
  const handleMouseEnter = (): void => {
    map.getCanvas().style.cursor = "pointer";
  };
  const handleMouseLeave = (): void => {
    map.getCanvas().style.cursor = "";
  };

  map.on("click", ITINERARY_STOPS_CIRCLE_LAYER_ID, handleClick);
  map.on("mouseenter", ITINERARY_STOPS_CIRCLE_LAYER_ID, handleMouseEnter);
  map.on("mouseleave", ITINERARY_STOPS_CIRCLE_LAYER_ID, handleMouseLeave);

  return () => {
    map.off("click", ITINERARY_STOPS_CIRCLE_LAYER_ID, handleClick);
    map.off("mouseenter", ITINERARY_STOPS_CIRCLE_LAYER_ID, handleMouseEnter);
    map.off("mouseleave", ITINERARY_STOPS_CIRCLE_LAYER_ID, handleMouseLeave);
  };
}
