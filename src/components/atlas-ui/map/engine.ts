import type { GeoJSONSource, Map as MapboxMap } from "mapbox-gl/esm";
import { HOTEL_LNGLAT, MAP_CENTER, DESIGN_ZOOM, PLACE_LNGLAT, YOU_LNGLAT, type LngLat } from "./geo";
import { markerImageId, registerMarkers, type MarkerBitmaps } from "./markers";
import { addBuildingExtrusions, applyAtlasPalette, MAP_STYLE_URL } from "./style";
import type { CameraTarget, MapScene } from "./scene";
import { sidePanelWidth } from "../use-layout";
import routes from "./routes.json";

/*
 * The map engine behind AtlasMap: map construction, Atlas sources and layers, and the scene,
 * tilt and camera updates. It is loaded only through a dynamic import, alongside mapbox-gl, so
 * screens that never show the map do not download it.
 */

export { rasterizeMarkers } from "./markers";

type MapboxGl = typeof import("mapbox-gl/esm");

const TILT = 45;

// Walking routes from Hotel A, fetched once from Mapbox Directions and kept as a fixture.
const ROUTE_LINES = routes as unknown as Record<string, LngLat[]>;

type Feature = GeoJSON.Feature<GeoJSON.Point, { marker: string; placeId?: string }>;

function point(coordinates: LngLat, marker: string, placeId?: string): Feature {
  return { type: "Feature", geometry: { type: "Point", coordinates }, properties: { marker: markerImageId(marker), placeId } };
}

/** A point a quarter of the way along the route, where the design puts the walker. */
function alongRoute(line: LngLat[]): LngLat {
  return line[Math.max(1, Math.floor(line.length / 4))] ?? line[0];
}

function markerFeatures(scene: MapScene): GeoJSON.FeatureCollection {
  const features: Feature[] = [];
  const line = scene.route ? ROUTE_LINES[scene.route] : undefined;

  if (scene.route && line) {
    // Route screens: start, destination and walker, as the route map art draws them.
    features.push(point(line[0], "route-start"));
    const destination = scene.places[0];
    features.push(point(line[line.length - 1], destination?.marker ?? "route-destination", destination?.id));
    features.push(point(alongRoute(line), "route-you"));
    return { type: "FeatureCollection", features };
  }

  // Draw order follows the design: places, then the hotel, then the guest on top.
  const ordered = [...scene.places].sort((a, b) => Number(a.marker.endsWith("selected")) - Number(b.marker.endsWith("selected")));
  for (const place of ordered) features.push(point(PLACE_LNGLAT[place.id], place.marker, place.id));
  if (scene.hotel) features.push(point(HOTEL_LNGLAT, "hotel"));
  if (scene.you) features.push(point(YOU_LNGLAT, "you"));
  return { type: "FeatureCollection", features };
}

function routeFeature(scene: MapScene): GeoJSON.FeatureCollection {
  const line = scene.route ? ROUTE_LINES[scene.route] : undefined;
  if (!line) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry: { type: "LineString", coordinates: line }, properties: {} }],
  };
}

type MapHandlers = {
  onReady: () => void;
  onUnauthorized: () => void;
  onPlaceClick: (placeId: string) => void;
};

/** Creates the one Mapbox map, with the Atlas palette, sources, layers and marker handlers. */
export function createAtlasMap(
  mapboxgl: MapboxGl,
  container: HTMLDivElement,
  bitmaps: MarkerBitmaps,
  { onReady, onUnauthorized, onPlaceClick }: MapHandlers
): MapboxMap {
  const map = new mapboxgl.Map({
    container,
    style: MAP_STYLE_URL,
    center: MAP_CENTER,
    zoom: DESIGN_ZOOM,
    pitch: 0,
    attributionControl: false,
    logoPosition: "bottom-left",
    dragRotate: false,
    pitchWithRotate: false,
  });
  map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
  map.touchZoomRotate.disableRotation();
  // Development only: lets browser tooling inspect the map.
  if (process.env.NODE_ENV !== "production") (window as unknown as { __atlasMap?: MapboxMap }).__atlasMap = map;

  map.on("error", (event) => {
    if (String(event.error?.message ?? "").includes("401")) onUnauthorized();
  });

  map.on("style.load", () => {
    applyAtlasPalette(map);
    addBuildingExtrusions(map);
  });

  // Atlas sources, layers and marker images go in after the first `load`. Adding images any
  // earlier, while the first tiles are still being parsed, leaves those tiles stuck loading
  // (mapbox-gl 3.33), which shows as a blank map.
  map.once("load", () => {
    registerMarkers(map, bitmaps);

    if (!map.getSource("atlas-route")) {
      map.addSource("atlas-route", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "atlas-route-line",
        type: "line",
        source: "atlas-route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#0a4a4f", "line-width": 5 },
      });
    }
    if (!map.getSource("atlas-places")) {
      map.addSource("atlas-places", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "atlas-markers",
        type: "symbol",
        source: "atlas-places",
        layout: {
          "icon-image": ["get", "marker"],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "symbol-z-order": "source",
        },
      });
    }
    onReady();
  });

  map.on("click", "atlas-markers", (event) => {
    const placeId = event.features?.[0]?.properties?.placeId as string | undefined;
    if (placeId) onPlaceClick(placeId);
  });
  map.on("mouseenter", "atlas-markers", (event) => {
    if (event.features?.[0]?.properties?.placeId) map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "atlas-markers", () => {
    map.getCanvas().style.cursor = "";
  });

  return map;
}

/** Shows a scene on the map. Returns whether the camera is now framing a route. */
export function applyScene(
  map: MapboxMap,
  container: HTMLDivElement | null,
  scene: MapScene,
  { wide, framedRoute }: { wide: boolean; framedRoute: boolean }
): boolean {
  (map.getSource("atlas-places") as GeoJSONSource | undefined)?.setData(markerFeatures(scene));
  (map.getSource("atlas-route") as GeoJSONSource | undefined)?.setData(routeFeature(scene));
  // Beside a side panel (wide layout) the camera centre and Mapbox's logo move right of the
  // panel; under a phone sheet the attribution sits above the sheet.
  const panelEdge = wide && scene.panel ? sidePanelWidth() + 32 : 0;
  map.setPadding({ left: panelEdge, top: 0, right: 0, bottom: 0 });
  container?.style.setProperty(
    "--atlas-map-inset",
    wide ? "0px" : `calc(${scene.bottomInset}px + env(safe-area-inset-bottom))`
  );
  container?.style.setProperty("--atlas-map-left-inset", `${panelEdge}px`);

  const line = scene.route ? ROUTE_LINES[scene.route] : undefined;
  if (!line && framedRoute) {
    // Leaving a route screen: return to the design view.
    map.jumpTo({ center: MAP_CENTER, zoom: DESIGN_ZOOM });
  }
  if (line) {
    const lngs = line.map((c) => c[0]);
    const lats = line.map((c) => c[1]);
    map.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      {
        padding: wide
          ? { top: 48, bottom: 48, left: panelEdge + 48, right: 72 }
          : { top: 140, bottom: scene.bottomInset + 48, left: 48, right: 72 },
        pitch: 0,
        duration: 0,
        maxZoom: 16.5,
      }
    );
  }
  return Boolean(line);
}

/** Tilts the map for 3D and shows the building extrusions, or flattens it for 2D. */
export function applyDimension(map: MapboxMap, tilted: boolean, reducedMotion: boolean): void {
  map.easeTo({ pitch: tilted ? TILT : 0, duration: reducedMotion ? 0 : 600 });
  if (map.getLayer("atlas-buildings-3d")) map.setLayoutProperty("atlas-buildings-3d", "visibility", tilted ? "visible" : "none");
}

/** Moves the camera to a map-control target. */
export function applyCamera(map: MapboxMap, target: CameraTarget, reducedMotion: boolean): void {
  const center = target === "you" ? YOU_LNGLAT : target === "hotel" ? HOTEL_LNGLAT : MAP_CENTER;
  const options = { center, zoom: target === "design" ? DESIGN_ZOOM : 15.2 };
  if (reducedMotion) map.jumpTo(options);
  else map.flyTo({ ...options, duration: 800 });
}
