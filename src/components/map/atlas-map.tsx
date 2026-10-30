"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapService, type AnchorMarker, type FocusBounds } from "@/services/mapbox/mapService";
import { getPerformanceSettings } from "@/services/mapbox/performance";
import { mapThemeService } from "@/services/mapbox/mapTheme";
import { attachPlaceSelection, attachItineraryStopSelection, externallyDeselect } from "@/services/mapbox/selection";
import type { PlaceFeatureCollection } from "@/services/mapbox/mapTypes";
import type { ItineraryStopFeatureCollection } from "@/services/mapbox/layers/itineraryStopsLayer";
import { locationService, type LocationState } from "@/services/location";
import type { PlaceMapPoint } from "@/db/queries/places";
import type { RouteGeometry } from "@/services/routing";
import type { AdvisorStopView } from "@/services/advisor/current-itinerary";
import type { GuestPlaceModel } from "@/services/map3d/guest-models";
import { addFramingControl, addLocateControl, addThemeToggleControl, addViewModeControl } from "./controls";
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
  directionsLeg,
  routeFitKey,
  models,
  focusBounds,
  focusLabel = "Trip",
  anchorMarker,
  isolatedPreview = false,
}: {
  places: PlaceMapPoint[];
  /** Optional area the camera should open on (e.g. a sample trip). Read once at mount. A framing button then flips between it and the Georgia overview. */
  focusBounds?: FocusBounds;
  /** Short label for the button that returns to the focus area, e.g. "Trip". */
  focusLabel?: string;
  /** One clearly labelled marker (e.g. "H" for the hotel at the start and end of a route). */
  anchorMarker?: AnchorMarker;
  /**
   * Development previews only: the map does not request the guest's location, does not fly to it, and does not replace
   * `places` with the guest's eligible places, so what the page passes in is exactly what is shown. Never set on real guest pages.
   */
  isolatedPreview?: boolean;
  /** The Advisor's persisted itinerary route — undefined/null both mean "nothing to show," never a second routing implementation; this is purely the already-computed geometry being rendered. */
  route?: RouteGeometry | null;
  /** The 3D models this guest may see (eligible for their hotel, lock state resolved by the server). Display only. */
  models?: GuestPlaceModel[];
  /** The walking leg to the current stop, drawn over the full route. Null/undefined clears it. */
  directionsLeg?: RouteGeometry | null;
  /** Changes when a NEW plan is shown (e.g. the day id + generation time). The camera frames the route once per key, never on an ordinary re-render. */
  routeFitKey?: string | null;
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
  const modelsRef = useRef<GuestPlaceModel[]>(models ?? []);
  const onItineraryStopSelectRef = useRef(onItineraryStopSelect);
  const selectedIdRef = useRef<string | null>(null);
  const hasFetchedNearbyRef = useRef(false);
  const focusBoundsRef = useRef(focusBounds ?? null);
  const anchorMarkerRef = useRef(anchorMarker ?? null);
  const isolatedPreviewRef = useRef(isolatedPreview);
  // Bridges the mount-once effect below to tryFitRoute, which is declared after it.
  const tryFitRouteRef = useRef<() => void>(() => {});

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

    const service = new MapService(containerRef.current, mapThemeService.getTheme(), getPerformanceSettings(), focusBoundsRef.current);
    mapServiceRef.current = service;

    service
      .initialize()
      .then((map) => {
        if (cancelled) {
          service.destroy();
          return;
        }

        service.updatePlaces(toFeatureCollection(placesRef.current));
        service.setAnchorMarker(anchorMarkerRef.current);
        service.updateRoute(routeRef.current);
        service.updateItineraryStops(toItineraryStopFeatureCollection(itineraryStopsRef.current));
        tryFitRouteRef.current();
        service.updateModels(modelsRef.current);

        cleanups.push(attachPlaceSelection(map, selectPlace));
        // Registered AFTER place selection so a model tap is handled last and wins: it opens the model's LINKED Place.
        const handleModelClick = (event: { point: { x: number; y: number } }) => {
          const placeId = service.pickModel(event.point);
          if (placeId) selectPlace(placeId);
        };
        map.on("click", handleModelClick);
        cleanups.push(() => map.off("click", handleModelClick));
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

        // 2D/3D: the map starts in a stable tilted view (flat on low-power devices / reduced motion); this toggle is the
        // flat fallback and the way back. The label follows the real pitch, so a manual tilt gesture keeps it honest.
        const { setMode } = addViewModeControl(map, service.getViewMode(), () =>
          service.setViewMode(service.getViewMode() === "3d" ? "2d" : "3d")
        );
        const syncViewMode = () => setMode(service.getViewMode());
        map.on("pitchend", syncViewMode);
        cleanups.push(() => map.off("pitchend", syncViewMode));

        // When the page gave a focus area, one tap flips between it and the whole-country Georgia overview.
        if (service.hasFocusArea()) {
          const { setTarget } = addFramingControl(map, service.getFraming(), focusLabel, () => {
            service.showFraming(service.getFraming() === "focus" ? "georgia" : "focus");
            setTarget(service.getFraming());
          });
        }

        cleanups.push(
          locationService.onChange((state) => {
            setLocationState(state);
            setStatus(state.status);

            if (state.status === "active" && state.coords) {
              const coords = { lat: state.coords.latitude, lng: state.coords.longitude };
              service.setUserLocation(coords, state.accuracy);
              // A development preview keeps its own camera and data: no auto-centering, no nearby swap.
              if (isolatedPreviewRef.current) return;
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
        // A development preview never asks for the guest's location by itself (the locate button still works).
        if (!isolatedPreviewRef.current) {
          locationService.start();
          cleanups.push(() => locationService.stop());
        }
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
    modelsRef.current = models ?? [];
    mapServiceRef.current?.updateModels(models ?? []);
  }, [models]);

  useEffect(() => {
    mapServiceRef.current?.updateLeg(directionsLeg ?? null);
  }, [directionsLeg]);

  // Frame a newly shown route exactly once per key. Held in refs so a re-render with the same plan never moves the camera.
  const fittedKeyRef = useRef<string | null>(null);
  const routeFitKeyRef = useRef(routeFitKey ?? null);
  const tryFitRoute = useCallback(() => {
    const service = mapServiceRef.current;
    const key = routeFitKeyRef.current;
    const geometry = routeRef.current;
    if (!service || !geometry || !key || fittedKeyRef.current === key) return;
    const stopPoints = itineraryStopsRef.current.map((stop): [number, number] => [stop.longitude, stop.latitude]);
    // Only remembered once the camera actually moved: before the map has loaded this is a no-op and is retried.
    if (service.fitToRoute(geometry, stopPoints)) fittedKeyRef.current = key;
  }, []);
  useEffect(() => {
    tryFitRouteRef.current = tryFitRoute;
  }, [tryFitRoute]);
  useEffect(() => {
    routeFitKeyRef.current = routeFitKey ?? null;
    tryFitRoute();
  }, [route, routeFitKey, tryFitRoute]);

  useEffect(() => {
    anchorMarkerRef.current = anchorMarker ?? null;
    mapServiceRef.current?.setAnchorMarker(anchorMarker ?? null);
  }, [anchorMarker]);

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
      <PlaceDetailsPanel
        place={selectedPlace}
        userCoords={locationState.coords}
        modelDisplacementMeters={
          selectedPlace ? (models ?? []).find((model) => model.placeId === selectedPlace.id)?.displacementMeters ?? 0 : 0
        }
        onClose={() => selectPlace(null)}
      />
    </div>
  );
}
