import mapboxgl, { type Map as MapboxMap } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type { Coordinates, PerformanceSettings, PlaceFeatureCollection, ThemeDefinition, ThemeName } from "./mapTypes";
import { assertMapboxToken, INITIAL_ZOOM, MAX_ZOOM, MIN_ZOOM, PLACES_MIN_ZOOM } from "./mapTuning";
import { mapboxPublicConfig } from "./config";
import { GEORGIA_CENTER, MAX_BOUNDS } from "./georgiaBoundary";
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

  constructor(
    private readonly container: HTMLElement,
    themeName: ThemeName,
    private readonly performance: PerformanceSettings
  ) {
    this.currentTheme = getTheme(themeName);
    this.buildingsMinZoom = performance.buildingsMinZoom;
  }

  initialize(): Promise<MapboxMap> {
    let map: MapboxMap;
    try {
      assertMapboxToken();
      mapboxgl.accessToken = mapboxPublicConfig.accessToken;

      // Deliberately NOT touching window.devicePixelRatio here — see performance.ts.
      map = new mapboxgl.Map({
        container: this.container,
        style: this.currentTheme.styleUrl,
        center: GEORGIA_CENTER,
        zoom: INITIAL_ZOOM,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        maxBounds: MAX_BOUNDS,
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
    this.userLocationLayer?.remove();
    this.map?.remove();
    this.map = null;
  }
}
