import mapboxgl, { type Map as MapboxMap } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type { Coordinates, PerformanceSettings, PlaceFeatureCollection, ThemeDefinition, ThemeName } from "./mapTypes";
import {
  assertMapboxToken,
  GEORGIA_FIT_PADDING_PX,
  INITIAL_ZOOM,
  MAX_PITCH,
  MAX_ZOOM,
  MIN_ZOOM,
  FIT_BACKOFF_STEP,
  FOCUS_FIT_PADDING_PX,
  MAX_FOCUS_ZOOM,
  PITCH_FIT_MARGIN_ZOOM,
  PLACES_MIN_ZOOM,
  VIEW_3D_PITCH,
} from "./mapTuning";
import { mapboxPublicConfig } from "./config";
import { GEORGIA_BOUNDARY, GEORGIA_CENTER, GEORGIA_FIT_BOUNDS } from "./georgiaBoundary";
import { getTheme } from "./themes";
import { addMaskLayer } from "./layers/maskLayer";
import { addBuildingsLayer, setBuildingsMinZoom } from "./layers/buildingsLayer";
import { addPlacesLayer, setPlacesData } from "./layers/placesLayer";
import { UserLocationLayer } from "./layers/userLocationLayer";
import { addRouteLayer, setRouteData } from "./layers/routeLayer";
import { addItineraryStopsLayer, setItineraryStopsData, type ItineraryStopFeatureCollection } from "./layers/itineraryStopsLayer";
import type { RouteGeometry } from "@/services/routing";

const EMPTY_PLACES: PlaceFeatureCollection = { type: "FeatureCollection", features: [] };
const EMPTY_ITINERARY_STOPS: ItineraryStopFeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Owns the one Mapbox GL `Map` instance for the whole app and every
 * map-specific layer/marker. This is the module the rest of Atlas (Advisor,
 * Achievements, Hotel) should eventually drive through — nothing outside
 * `services/mapbox/` should construct its own `mapboxgl.Map`.
 */
export type MapViewMode = "3d" | "2d";

/** One labelled marker (e.g. "H" for a hotel) drawn on top of the map. A single DOM marker, not a per-place layer. */
export type AnchorMarker = { latitude: number; longitude: number; label: string; title: string };

/** An optional area a page can ask the camera to focus on, as [[west, south], [east, north]]. */
export type FocusBounds = [[number, number], [number, number]];

/** "georgia" = the whole-country overview; "focus" = the page's focus area (only if one was given). */
export type FramingTarget = "georgia" | "focus";

/** Start in the stable 3D view unless the device is low-powered (no usable WebGL tier / weak hardware) or the user prefers reduced motion; those start in flat 2D. */
function chooseInitialViewMode(performance: PerformanceSettings): MapViewMode {
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return performance.profile === "low" || reducedMotion ? "2d" : "3d";
}

export class MapService {
  private map: MapboxMap | null = null;
  private userLocationLayer: UserLocationLayer | null = null;
  private currentTheme: ThemeDefinition;
  private buildingsMinZoom: number;
  private hasCenteredOnUserOnce = false;
  /** The last Places collection, re-applied after every `setStyle()` (theme switch wipes sources/layers, same way UserLocationLayer re-applies the accuracy fill). Without this, toggling the theme silently blanks every Place. */
  private lastPlacesCollection: PlaceFeatureCollection = EMPTY_PLACES;
  /** Same re-apply-after-style-change need as Places, for the Advisor's persisted route line and itinerary-stop markers. */
  private lastRouteGeometry: RouteGeometry | null = null;
  private lastItineraryStops: ItineraryStopFeatureCollection = EMPTY_ITINERARY_STOPS;

  private framing: FramingTarget;
  private anchorMarker: mapboxgl.Marker | null = null;
  /** True once the guest has moved the camera themselves; until then a resize re-fits the current target. */
  private userMoved = false;

  constructor(
    private readonly container: HTMLElement,
    themeName: ThemeName,
    private readonly performance: PerformanceSettings,
    private readonly focusBounds: FocusBounds | null = null
  ) {
    this.framing = focusBounds ? "focus" : "georgia";
    this.currentTheme = getTheme(themeName);
    this.buildingsMinZoom = performance.buildingsMinZoom;
  }

  initialize(): Promise<MapboxMap> {
    let map: MapboxMap;
    try {
      assertMapboxToken();
      mapboxgl.accessToken = mapboxPublicConfig.accessToken;
      const initialMode = chooseInitialViewMode(this.performance);

      // Deliberately NOT touching window.devicePixelRatio here — see performance.ts.
      map = new mapboxgl.Map({
        container: this.container,
        style: this.currentTheme.styleUrl,
        // Placeholder camera only: it is replaced by frameGeorgia() below, before the first frame is drawn.
        // Deliberately no bounds lock (no maxBounds option passed): the camera is free to move; Atlas is focused on Georgia, not hard-locked to it.
        center: GEORGIA_CENTER,
        zoom: INITIAL_ZOOM,
        pitch: initialMode === "3d" ? VIEW_3D_PITCH : 0,
        bearing: 0,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        maxPitch: MAX_PITCH,
        antialias: this.performance.antialias,
        fadeDuration: this.performance.fadeDuration,
        renderWorldCopies: false,
        pitchWithRotate: true,
        touchPitch: true,
        attributionControl: false,
      });
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error("Mapbox failed to initialize"));
    }

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "top-right");
    this.map = map;
    this.frame(map, this.framing, map.getPitch()); // the starting tilt was set in the constructor
    this.keepFramedUntilUserMoves(map);

    return new Promise((resolve, reject) => {
      let settled = false;

      map.on("error", (event) => {
        const status = (event.error as { status?: number } | undefined)?.status;
        // 401/403 means a bad or restricted token — nothing will ever render, so surface it.
        // Anything else (a missing sprite icon, a single failed tile) is routine and non-fatal.
        if (!settled && (status === 401 || status === 403)) {
          settled = true;
          reject(event.error);
          return;
        }
        console.error("[MapService] map error", event.error ?? event);
      });

      map.once("load", () => {
        if (settled) return;
        settled = true;
        this.addCustomLayers();
        resolve(map);
      });
    });
  }

  /**
   * Frames the chosen target for the container's CURRENT size: "georgia" is the whole country, "focus" is the
   * optional area the page asked to focus on (e.g. a sample trip). The fit is computed flat (pitch 0), which is
   * reliable at any aspect ratio, then the tilt is applied with a small zoom margin. Skipped while the container
   * has no real size yet; the resize handler frames it once it does. Returns whether it framed anything.
   */
  private frame(map: MapboxMap, target: FramingTarget, pitch: number): boolean {
    const { clientWidth, clientHeight } = map.getContainer();
    if (clientWidth < 80 || clientHeight < 80) return false;

    const focus = target === "focus" && this.focusBounds !== null;
    const bounds = focus && this.focusBounds ? this.focusBounds : GEORGIA_FIT_BOUNDS;
    const padding = focus ? FOCUS_FIT_PADDING_PX : GEORGIA_FIT_PADDING_PX;
    const camera = map.cameraForBounds(bounds, { padding, bearing: 0, pitch: 0 });
    if (!camera?.center || camera.zoom === undefined) return false;

    const margin = pitch > 5 ? PITCH_FIT_MARGIN_ZOOM : 0;
    const zoom = Math.min(focus ? MAX_FOCUS_ZOOM : MAX_ZOOM, Math.max(MIN_ZOOM, camera.zoom - margin));
    map.jumpTo({ center: camera.center, zoom, pitch, bearing: 0 });

    // Perspective makes the near part of a tilted view wider than the far part. So verify against the REAL shape
    // (Georgia's outline, or the focus area's corners): if any of it falls outside the frame, ease the zoom out a
    // little at a time until all of it fits (bounded, and never below the minimum zoom).
    for (let step = 0; step < 12 && !this.targetFits(map, target, padding); step += 1) {
      const next = map.getZoom() - FIT_BACKOFF_STEP;
      if (next < MIN_ZOOM) break;
      map.jumpTo({ zoom: next });
    }
    return true;
  }

  /** True when every vertex of the target (Georgia's outline, or the focus box corners) projects inside the map's frame, with padding. */
  private targetFits(map: MapboxMap, target: FramingTarget, pad: number): boolean {
    const { clientWidth: width, clientHeight: height } = map.getContainer();
    let vertices: Array<[number, number]>;
    if (target === "focus" && this.focusBounds) {
      const [[west, south], [east, north]] = this.focusBounds;
      vertices = [
        [west, south],
        [west, north],
        [east, south],
        [east, north],
      ];
    } else {
      vertices = GEORGIA_BOUNDARY.geometry.coordinates[0] as Array<[number, number]>;
    }
    return vertices.every((vertex) => {
      const point = map.project(vertex);
      return point.x >= pad && point.x <= width - pad && point.y >= pad && point.y <= height - pad;
    });
  }

  /** Shows (or, with null, removes) the single labelled anchor marker. */
  setAnchorMarker(anchor: AnchorMarker | null): void {
    this.anchorMarker?.remove();
    this.anchorMarker = null;
    if (!anchor || !this.map) return;
    const element = document.createElement("div");
    element.className = "atlas-anchor-marker";
    element.textContent = anchor.label;
    element.title = anchor.title;
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", anchor.title);
    this.anchorMarker = new mapboxgl.Marker({ element }).setLngLat([anchor.longitude, anchor.latitude]).addTo(this.map);
  }

  /** What the camera is currently framing: the page's focus area (if it gave one) or the whole of Georgia. */
  getFraming(): FramingTarget {
    return this.framing;
  }

  hasFocusArea(): boolean {
    return this.focusBounds !== null;
  }

  /**
   * Smoothly moves the camera to the focus area or to the Georgia overview. Computes the destination off-screen
   * (jump, read, jump back) and then flies there, so the framing logic exists in exactly one place.
   */
  showFraming(target: FramingTarget): void {
    const map = this.getMap();
    this.framing = target;
    this.userMoved = false; // an explicit choice re-enables keeping this framing on resize
    const before = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() };
    if (!this.frame(map, target, before.pitch)) return;
    const after = { center: map.getCenter(), zoom: map.getZoom(), pitch: map.getPitch(), bearing: 0 };
    map.jumpTo(before);
    map.flyTo({ ...after, essential: true });
  }

  /**
   * The initial fit is computed for the container size at construction. If the viewport then changes (a phone
   * rotates, the window is resized) and the guest has not touched the map yet, re-fit the current target so it is
   * still clearly visible. The moment the guest pans/zooms/tilts themselves we stop: the map never fights a manual
   * move. Not a bounds lock: the camera stays completely free.
   */
  private keepFramedUntilUserMoves(map: MapboxMap): void {
    map.on("movestart", (event) => {
      // Programmatic moves (fitBounds, flyTo, easeTo) have no originalEvent; real gestures do.
      if ((event as { originalEvent?: unknown }).originalEvent) this.userMoved = true;
    });
    map.on("resize", () => {
      if (this.userMoved) return;
      this.frame(map, this.framing, map.getPitch());
    });
  }

  private addCustomLayers(): void {
    const map = this.map;
    if (!map) return;
    addMaskLayer(map, this.currentTheme);
    addBuildingsLayer(map, this.currentTheme, this.buildingsMinZoom);
    addPlacesLayer(map, this.currentTheme, PLACES_MIN_ZOOM);
    setPlacesData(map, this.lastPlacesCollection);
    addRouteLayer(map, this.currentTheme);
    setRouteData(map, this.lastRouteGeometry);
    addItineraryStopsLayer(map);
    setItineraryStopsData(map, this.lastItineraryStops);
    this.userLocationLayer?.reapplyAfterStyleChange(this.currentTheme);
  }

  /** "3d" when the map is meaningfully tilted, otherwise flat "2d". */
  getViewMode(): MapViewMode {
    return (this.map?.getPitch() ?? 0) > 5 ? "3d" : "2d";
  }

  /** Switches between the stable tilted 3D view and the flat 2D fallback. A short ease, north-up, no other camera change. */
  setViewMode(mode: MapViewMode): void {
    this.getMap().easeTo({ pitch: mode === "3d" ? VIEW_3D_PITCH : 0, bearing: 0, duration: 500, essential: true });
  }

  getMap(): MapboxMap {
    if (!this.map) throw new Error("MapService.initialize() must resolve before use");
    return this.map;
  }

  /** Non-throwing variant for callers that just want to know if the map is ready yet (e.g. a React effect that may run before initialize() resolves). */
  getMapOrNull(): MapboxMap | null {
    return this.map;
  }

  setUserLocation(coords: Coordinates, accuracyMeters: number | null): void {
    const map = this.getMap();
    if (!this.userLocationLayer) {
      this.userLocationLayer = new UserLocationLayer(map, this.currentTheme);
    }
    this.userLocationLayer.update(coords, accuracyMeters);
  }

  /** Moves the camera to the user exactly once automatically (first fix); afterwards only via explicit "locate me" clicks — the map must never fight a manual pan. */
  centerOnUser(coords: Coordinates, { force = false }: { force?: boolean } = {}): void {
    if (this.hasCenteredOnUserOnce && !force) return;
    this.hasCenteredOnUserOnce = true;

    const map = this.getMap();
    map.flyTo({
      center: [coords.lng, coords.lat],
      zoom: Math.max(map.getZoom(), 14),
      essential: true,
      speed: 1.2,
    });
  }

  flyTo(coords: Coordinates, zoom = 15.5): void {
    this.getMap().flyTo({ center: [coords.lng, coords.lat], zoom, essential: true });
  }

  /** Always stores the collection (so a later style/theme change can re-apply it), and pushes it to the live source only when the source already exists. */
  updatePlaces(collection: PlaceFeatureCollection): void {
    this.lastPlacesCollection = collection;
    if (this.map) setPlacesData(this.map, collection);
  }

  /** The Advisor's persisted itinerary route — null clears it (e.g. no active itinerary). Same store-then-push pattern as updatePlaces, for the same reason (style/theme changes wipe the live source). */
  updateRoute(geometry: RouteGeometry | null): void {
    this.lastRouteGeometry = geometry;
    if (this.map) setRouteData(this.map, geometry);
  }

  /** The itinerary's own stop markers (completed/current/upcoming), a separate layer from the general Places circles — see itineraryStopsLayer.ts. */
  updateItineraryStops(collection: ItineraryStopFeatureCollection): void {
    this.lastItineraryStops = collection;
    if (this.map) setItineraryStopsData(this.map, collection);
  }

  setMapTheme(themeName: ThemeName): void {
    const theme = getTheme(themeName);
    this.currentTheme = theme;
    const map = this.getMap();

    this.userLocationLayer?.applyTheme(theme);
    map.once("style.load", () => this.addCustomLayers());
    map.setStyle(theme.styleUrl);
  }

  applyPerformanceSettings(settings: PerformanceSettings): void {
    this.buildingsMinZoom = settings.buildingsMinZoom;
    if (this.map) setBuildingsMinZoom(this.map, settings.buildingsMinZoom);
  }

  destroy(): void {
    this.anchorMarker?.remove();
    this.anchorMarker = null;
    this.userLocationLayer?.remove();
    this.map?.remove();
    this.map = null;
  }
}
