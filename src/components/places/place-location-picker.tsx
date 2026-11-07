"use client";

import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { mapboxPublicConfig } from "@/services/mapbox/config";
import { GEORGIA_FIT_BOUNDS } from "@/services/mapbox/georgiaBoundary";

/*
 * Where a Place is, picked on a map: click to drop the pin, drag it to fine-tune, or type the numbers.
 * The inputs stay the source of truth (they are what the form submits, named latitude/longitude), and
 * the pin follows them both ways. The server still validates the coordinates; the map is only a way to
 * choose them.
 *
 * An admin-only map of its own: it shows no Places, so it never competes with the guest map's single
 * instance or with Atlas's own data. Without a public Mapbox token it hides itself and the inputs still work.
 */

const STYLES = {
  map: "mapbox://styles/mapbox/streets-v12",
  satellite: "mapbox://styles/mapbox/satellite-streets-v12",
} as const;
type StyleKey = keyof typeof STYLES;

const PIN_ZOOM = 17;
const DECIMALS = 6; // about 10 cm: more than enough for a check-in radius in metres.

function parse(value: string, min: number, max: number): number | null {
  if (value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

const INPUT =
  "block w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none";

export function PlaceLocationPicker({
  defaultLatitude,
  defaultLongitude,
}: {
  defaultLatitude?: number | null;
  defaultLongitude?: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  const [latitude, setLatitude] = useState(defaultLatitude?.toString() ?? "");
  const [longitude, setLongitude] = useState(defaultLongitude?.toString() ?? "");
  const [style, setStyle] = useState<StyleKey>("map");
  const [mapError, setMapError] = useState<string | null>(mapboxPublicConfig.accessToken ? null : "missing-token");

  // Called from map events, which outlive any one render: always write through the setters.
  const placePin = (lng: number, lat: number) => {
    setLatitude(lat.toFixed(DECIMALS));
    setLongitude(lng.toFixed(DECIMALS));
  };

  // Mount the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !mapboxPublicConfig.accessToken) return;
    mapboxgl.accessToken = mapboxPublicConfig.accessToken;
    // React may mount this twice in development; start from an empty container each time.
    container.replaceChildren();

    const startLat = parse(latitude, -90, 90);
    const startLng = parse(longitude, -180, 180);
    const hasStart = startLat !== null && startLng !== null;

    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container,
        style: STYLES.map,
        ...(hasStart ? { center: [startLng, startLat] as [number, number], zoom: PIN_ZOOM } : { bounds: GEORGIA_FIT_BOUNDS }),
        attributionControl: true,
        cooperativeGestures: true,
      });
    } catch {
      // No WebGL, for example. Reported after this effect, never during it.
      queueMicrotask(() => setMapError("unavailable"));
      return;
    }
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    // Only a failure before the map ever loads (bad token, style unreachable) hides it; a missing tile later doesn't.
    let loaded = false;
    map.on("load", () => {
      loaded = true;
    });
    map.on("error", () => {
      if (!loaded) setMapError((current) => current ?? "unavailable");
    });

    const marker = new mapboxgl.Marker({ draggable: true, color: "#0a4a4f" });
    markerRef.current = marker;
    if (hasStart) marker.setLngLat([startLng, startLat]).addTo(map);

    marker.on("dragend", () => {
      const { lng, lat } = marker.getLngLat();
      placePin(lng, lat);
    });
    map.on("click", (event) => {
      marker.setLngLat(event.lngLat).addTo(map);
      placePin(event.lngLat.lng, event.lngLat.lat);
      // A click on a wide view is rough: zoom in on the pin so it can be dragged to the exact spot.
      if (map.getZoom() < PIN_ZOOM - 2) map.flyTo({ center: event.lngLat, zoom: PIN_ZOOM - 1 });
    });

    return () => {
      marker.remove();
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // Mounted once; later coordinate changes move the pin in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Typed coordinates move the pin (and the view, if the pin left it).
  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    const lat = parse(latitude, -90, 90);
    const lng = parse(longitude, -180, 180);
    if (lat === null || lng === null) return;
    const current = marker.getLngLat?.();
    if (!current || current.lat.toFixed(DECIMALS) !== lat.toFixed(DECIMALS) || current.lng.toFixed(DECIMALS) !== lng.toFixed(DECIMALS)) {
      marker.setLngLat([lng, lat]).addTo(map);
    }
    if (!map.getBounds()?.contains([lng, lat])) map.jumpTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), PIN_ZOOM) });
  }, [latitude, longitude]);

  const switchStyle = (next: StyleKey) => {
    setStyle(next);
    mapRef.current?.setStyle(STYLES[next]);
  };

  // One reading on request, not a watch: the admin is choosing where to look, not being tracked.
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const centerOnMe = () => {
    if (!("geolocation" in navigator)) {
      setLocateError("This browser can't share your location.");
      return;
    }
    setLocating(true);
    setLocateError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        mapRef.current?.flyTo({ center: [coords.longitude, coords.latitude], zoom: PIN_ZOOM });
      },
      (error) => {
        setLocating(false);
        setLocateError(
          error.code === error.PERMISSION_DENIED
            ? "Location is blocked for this site. Allow it in the browser's address bar, then try again."
            : "Couldn't find your location. Try again, or move the map yourself."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  };

  const showMap = mapError === null;

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-slate-700">Location</legend>
      {showMap ? (
        <>
          <p id="place-location-help" className="text-xs text-slate-500">
            Standing at the place? Use Centre on my location. Click the map to drop the pin; it zooms in so you can drag the pin to the exact entrance. Zoom with the buttons, or Ctrl + scroll.
          </p>
          <div className="relative overflow-hidden rounded-md border border-slate-300">
            <div ref={containerRef} className="h-[320px] w-full" aria-label="Map for choosing the place's location" role="application" />
            <div className="absolute left-2 top-2 flex overflow-hidden rounded-md border border-slate-300 bg-white text-xs shadow-sm">
              {(Object.keys(STYLES) as StyleKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => switchStyle(key)}
                  aria-pressed={style === key}
                  className={`px-3 py-1.5 font-medium ${style === key ? "bg-slate-900 text-white" : "text-slate-700"}`}
                >
                  {key === "map" ? "Map" : "Satellite"}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={centerOnMe}
              disabled={locating}
              className="absolute bottom-8 left-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm disabled:opacity-60"
            >
              {locating ? "Finding you…" : "Centre on my location"}
            </button>
          </div>
          {locateError && (
            <p role="alert" className="text-xs text-red-600">
              {locateError}
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-slate-500">
          {mapError === "missing-token"
            ? "The map isn't available on this deployment (no public Mapbox token), so type the coordinates."
            : "The map couldn't load. Type the coordinates instead."}
        </p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Latitude</span>
          <input
            name="latitude"
            type="number"
            step="any"
            min={-90}
            max={90}
            required
            value={latitude}
            onChange={(event) => setLatitude(event.target.value)}
            aria-describedby={showMap ? "place-location-help" : undefined}
            className={INPUT}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Longitude</span>
          <input
            name="longitude"
            type="number"
            step="any"
            min={-180}
            max={180}
            required
            value={longitude}
            onChange={(event) => setLongitude(event.target.value)}
            aria-describedby={showMap ? "place-location-help" : undefined}
            className={INPUT}
          />
        </label>
      </div>
    </fieldset>
  );
}
