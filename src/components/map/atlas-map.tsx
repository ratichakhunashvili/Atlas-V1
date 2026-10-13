"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapService } from "@/services/mapbox/mapService";
import { getPerformanceSettings } from "@/services/mapbox/performance";
import { mapThemeService } from "@/services/mapbox/mapTheme";
import { attachPlaceSelection, attachItineraryStopSelection, externallyDeselect } from "@/services/mapbox/selection";
import type { PlaceFeatureCollection } from "@/services/mapbox/mapTypes";
import type { ItineraryStopFeatureCollection } from "@/services/mapbox/layers/itineraryStopsLayer";
import { locationService, type LocationState } from "@/services/location";
import type { PlaceMapPoint } from "@/db/queries/places";
import type { RouteGeometry } from "@/services/routing";
import type { AdvisorStopView } from "@/services/advisor/current-itinerary";
import { addLocateControl, addThemeToggleControl } from "./controls";
import { PlaceDetailsPanel } from "./place-details-panel";
import "./atlas-map.css";

const LOCATION_MESSAGES: Partial<Record<LocationState["status"], string>> = {
  locating: "Finding your location…",
  denied: "Location access denied — map still works",
  unavailable: "Location unavailable",
  timeout: "Location timed out",
  unsupported: "Location not supported on this browser",
  error: "Location error",
};

function toFeatureCollection(places: PlaceMapPoint[]): PlaceFeatureCollection {
  return {
    type: "FeatureCollection",
    features: places.map((place) => ({
      type: "Feature",
      properties: { id: place.id, name: place.name, category: place.category },
      geometry: { type: "Point", coordinates: [place.longitude, place.latitude] },
    })),
  };
}

function toItineraryStopFeatureCollection(stops: AdvisorStopView[]): ItineraryStopFeatureCollection {
  return {
    type: "FeatureCollection",
    features: stops.map((stop) => ({
      type: "Feature",
      properties: { id: stop.id, status: stop.status, label: String(stop.position + 1) },
      geometry: { type: "Point", coordinates: [stop.longitude, stop.latitude] },
    })),
  };
}

export function AtlasMap({
  places,
  route,
  itineraryStops,
  onItineraryStopSelect,
}: {
  places: PlaceMapPoint[];
  /** The Advisor's persisted itinerary route — undefined/null both mean "nothing to show," never a second routing implementation; this is purely the already-computed geometry being rendered. */
  route?: RouteGeometry | null;
  /** The Advisor's own itinerary stops — rendered on a layer separate from `places`, with status-based styling (current-itinerary.ts decides status; this component only draws it). */
  itineraryStops?: AdvisorStopView[];
  /** Tapping a stop marker only focuses it in the Advisor sheet (point 15) — it can never make that stop check-in eligible, since completion stays entirely server-derived. */
  onItineraryStopSelect?: (stopId: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapServiceRef = useRef<MapService | null>(null);
  const placesRef = useRef(places);
  const routeRef = useRef(route ?? null);
  const itineraryStopsRef = useRef(itineraryStops ?? []);
  const onItineraryStopSelectRef = useRef(onItineraryStopSelect);
  const selectedIdRef = useRef<string | null>(null);
  const hasFetchedNearbyRef = useRef(false);

  const [selectedPlace, setSelectedPlace] = useState<PlaceMapPoint | null>(null);
  const [locationState, setLocationState] = useState<LocationState>(locationService.getState());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapTheme, setMapTheme] = useState(mapThemeService.getTheme());

  const selectPlace = useCallback((placeId: string | null) => {
    selectedIdRef.current = placeId;
    setSelectedPlace(placeId ? (placesRef.current.find((p) => p.id === placeId) ?? null) : null);
  }, []);

  // Mount the map exactly once. Empty deps is deliberate — React re-renders
  // (new `places`, location updates, etc.) must never recreate the Mapbox
  // instance. See the second effect below for how `places` updates flow in
  // without touching this one.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    const service = new MapService(containerRef.current, mapThemeService.getTheme(), getPerformanceSettings());
    mapServiceRef.current = service;

    service
      .initialize()
      .then((map) => {
        if (cancelled) {
          service.destroy();
          return;
        }

        service.updatePlaces(toFeatureCollection(placesRef.current));
        service.updateRoute(routeRef.current);
        service.updateItineraryStops(toItineraryStopFeatureCollection(itineraryStopsRef.current));

        cleanups.push(attachPlaceSelection(map, selectPlace));
        cleanups.push(attachItineraryStopSelection(map, (stopId) => onItineraryStopSelectRef.current?.(stopId)));
        cleanups.push(
          mapThemeService.onChange((theme) => {
            service.setMapTheme(theme);
            setMapTheme(theme);
          })
        );

        const { setStatus } = addLocateControl(map, () => {
          const state = locationService.getState();
          if (state.coords) {
            service.centerOnUser({ lat: state.coords.latitude, lng: state.coords.longitude }, { force: true });
          }
          locationService.requestOnce();
        });
        const { setTheme } = addThemeToggleControl(map, mapThemeService.getTheme(), () => mapThemeService.toggle());
        cleanups.push(mapThemeService.onChange(setTheme));

        cleanups.push(
          locationService.onChange((state) => {
            setLocationState(state);
            setStatus(state.status);

            if (state.status === "active" && state.coords) {
              const coords = { lat: state.coords.latitude, lng: state.coords.longitude };
              service.setUserLocation(coords, state.accuracy);
              service.centerOnUser(coords);

              // Narrow from the broad initial set to a tight radius around the
              // user's real position — once, on the first fix, not on every
              // subsequent jitter-filtered update (no continuous GPS-driven polling).
              if (!hasFetchedNearbyRef.current && state.coords) {
                hasFetchedNearbyRef.current = true;
                const { latitude, longitude } = state.coords;
                fetch(`/api/places/nearby?lat=${latitude}&lng=${longitude}&radius=5000`)
                  .then((res) => (res.ok ? (res.json() as Promise<{ places: PlaceMapPoint[] }>) : null))
                  .then((data) => {
                    if (!data) return;
                    placesRef.current = data.places;
                    service.updatePlaces(toFeatureCollection(data.places));
                  })
                  .catch((error: unknown) => console.error("[AtlasMap] nearby fetch failed", error));
              }
            }
          })
        );
        locationService.start();
        cleanups.push(() => locationService.stop());
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error("[AtlasMap] failed to initialize", error);
        setLoadError(error instanceof Error ? error.message : "Map failed to load.");
      });

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
      mapServiceRef.current?.destroy();
      mapServiceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Server-provided `places` changing (revalidation, navigation) updates the
  // already-mounted map's data source — it never recreates the map.
  useEffect(() => {
    placesRef.current = places;
    const service = mapServiceRef.current;
    if (!service) return;

    service.updatePlaces(toFeatureCollection(places));

    const stillPresent = selectedIdRef.current && places.some((p) => p.id === selectedIdRef.current);
    if (selectedIdRef.current && !stillPresent) {
      const map = service.getMapOrNull();
      if (map) externallyDeselect(map, selectedIdRef.current);
      selectedIdRef.current = null;
      setSelectedPlace(null);
    }
  }, [places]);

  // Same pattern as `places` above: the Advisor's persisted route only
  // changes when the server re-renders this page (generation, regeneration,
  // a check-in completing) — never recreates the map, never polls.
  useEffect(() => {
    routeRef.current = route ?? null;
    mapServiceRef.current?.updateRoute(route ?? null);
  }, [route]);

  useEffect(() => {
    itineraryStopsRef.current = itineraryStops ?? [];
    mapServiceRef.current?.updateItineraryStops(toItineraryStopFeatureCollection(itineraryStops ?? []));
  }, [itineraryStops]);

  useEffect(() => {
    onItineraryStopSelectRef.current = onItineraryStopSelect;
  }, [onItineraryStopSelect]);

  const statusMessage = LOCATION_MESSAGES[locationState.status];

  return (
    <div className="atlas-map" data-theme={mapTheme}>
      <div ref={containerRef} className="atlas-map-container" />
      {statusMessage && <div className="atlas-status-indicator">{statusMessage}</div>}
      {loadError && (
        <div className="atlas-status-indicator" role="alert">
          {loadError}
        </div>
      )}
      <PlaceDetailsPanel place={selectedPlace} userCoords={locationState.coords} onClose={() => selectPlace(null)} />
    </div>
  );
}
