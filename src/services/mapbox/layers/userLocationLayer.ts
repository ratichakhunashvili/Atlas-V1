import mapboxgl, { type Map as MapboxMap, type GeoJSONSource } from "mapbox-gl";
import type { Coordinates, ThemeDefinition } from "../mapTypes";
import { circlePolygon } from "../geo";

const ACCURACY_SOURCE_ID = "user-accuracy";
const ACCURACY_LAYER_ID = "user-accuracy-fill";
/** Beyond this, the accuracy circle is more visual noise than signal (coarse network/IP location). */
const MAX_USEFUL_ACCURACY_M = 150;

/**
 * A single small DOM element for the user's position — intentionally not a
 * WebGL layer or an animated sprite. Mapbox's own `Marker` keeps it pinned to
 * the right geographic spot with a cheap CSS transform, nothing re-rendered
 * on the GPU per frame.
 */
export class UserLocationLayer {
  private marker: mapboxgl.Marker | null = null;
  private readonly el: HTMLDivElement;
  private lastAccuracyFeature: GeoJSON.Feature<GeoJSON.Polygon> | null = null;

  constructor(
    private readonly map: MapboxMap,
    theme: ThemeDefinition
  ) {
    this.el = document.createElement("div");
    this.el.className = "atlas-user-location-dot";
    this.applyTheme(theme);
  }

  /** `setStyle` wipes sources/layers but leaves DOM markers alone — call after `style.load` to restore the accuracy fill. */
  reapplyAfterStyleChange(theme: ThemeDefinition): void {
    this.ensureAccuracySource();
    this.applyTheme(theme);
    const source = this.map.getSource(ACCURACY_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData({
      type: "FeatureCollection",
      features: this.lastAccuracyFeature ? [this.lastAccuracyFeature] : [],
    });
  }

  private ensureAccuracySource(): void {
    if (this.map.getSource(ACCURACY_SOURCE_ID)) return;
    this.map.addSource(ACCURACY_SOURCE_ID, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    this.map.addLayer({
      id: ACCURACY_LAYER_ID,
      type: "fill",
      source: ACCURACY_SOURCE_ID,
      paint: {
        "fill-color": "#5b9bff",
        "fill-opacity": 0.15,
      },
    });
  }

  update(coords: Coordinates, accuracyMeters: number | null): void {
    if (!this.marker) {
      this.marker = new mapboxgl.Marker({ element: this.el, anchor: "center" })
        .setLngLat([coords.lng, coords.lat])
        .addTo(this.map);
    } else {
      this.marker.setLngLat([coords.lng, coords.lat]);
    }

    this.ensureAccuracySource();
    const source = this.map.getSource(ACCURACY_SOURCE_ID) as GeoJSONSource | undefined;
    if (!source) return;

    if (accuracyMeters && accuracyMeters > 0 && accuracyMeters <= MAX_USEFUL_ACCURACY_M) {
      this.lastAccuracyFeature = circlePolygon(coords, accuracyMeters);
    } else {
      this.lastAccuracyFeature = null;
    }
    source.setData({
      type: "FeatureCollection",
      features: this.lastAccuracyFeature ? [this.lastAccuracyFeature] : [],
    });
  }

  applyTheme(theme: ThemeDefinition): void {
    this.el.style.setProperty("--atlas-user-marker-fill", theme.userMarker.fill);
    this.el.style.setProperty("--atlas-user-marker-ring", theme.userMarker.ring);
    if (this.map.getLayer(ACCURACY_LAYER_ID)) {
      this.map.setPaintProperty(ACCURACY_LAYER_ID, "fill-color", theme.userMarker.fill);
    }
  }

  remove(): void {
    this.marker?.remove();
    this.marker = null;
  }
}
