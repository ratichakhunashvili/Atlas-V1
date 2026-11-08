"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GuestPlaceModel } from "@/services/map3d/guest-models";
import type { PlaceId, RouteId } from "../fixtures";
import type { MarkerImage } from "./markers";
import type { LngLat } from "./geo";

/*
 * What the single shared map shows. Map screens (home, route, next stop) describe a scene and
 * the map applies it, so moving between those screens updates one Mapbox instance instead of
 * creating a new one.
 */

/**
 * A marker. Design screens use the fixture ids, placed where the Figma frame draws them; screens
 * on real data pass the Place's own id and coordinates in `at` ([lng, lat]).
 */
export type ScenePlace = { id: PlaceId | (string & {}); marker: MarkerImage; at?: [number, number] };

export type MapScene = {
  places: ScenePlace[];
  hotel: boolean;
  /** The guest's real hotel ([lng, lat]); without it the design's Hotel A position is used. */
  hotelAt?: [number, number];
  you: boolean;
  /** Draws the walking route from Hotel A to this destination. */
  route?: RouteId;
  /** A live walking route ([lng, lat] points, start to destination), fetched for the guest's own stop. */
  routeLine?: [number, number][];
  /** The guest's live position on a live route ([lng, lat]). */
  youAt?: [number, number];
  /**
   * Phone layout: how much of the bottom of the screen the screen's sheet (and the bar) covers,
   * so Mapbox's attribution stays visible and routes are framed above it.
   */
  bottomInset: number;
  /** In the wide layout this screen's sheet becomes a side panel on the left of the map. */
  panel: boolean;
  /** Route screens show a flat map; the home screen honours the 2D/3D toggle. */
  allowTilt: boolean;
  /** The 3D models this guest may see, already filtered and lock-resolved by the server (services/map3d). */
  models?: GuestPlaceModel[];
};

export type CameraTarget = "design" | "you" | "hotel" | "place";
/** What the camera was asked to show; `at` is the Place for target "place". */
export type CameraRequest = { target: CameraTarget; seq: number; at?: LngLat };
/** The visible map area, reported when the guest stops moving the map. */
export type MapViewport = { south: number; west: number; north: number; east: number };
export type MapDimension = "2D" | "3D";

/**
 * The design's map-dimension button reads "2D" on the home screen — it shows the mode you can
 * switch to — so the map starts tilted in 3D. Change this to "2D" to start flat.
 */
export const INITIAL_DIMENSION: MapDimension = "3D";

type SceneContextValue = {
  scene: MapScene | null;
  setScene: (scene: MapScene | null) => void;
  placeClickRef: React.RefObject<((id: string) => void) | null>;
  viewportRef: React.RefObject<((viewport: MapViewport) => void) | null>;
  camera: CameraRequest;
  moveCamera: (target: CameraTarget, at?: LngLat) => void;
  dimension: MapDimension;
  setDimension: (dimension: MapDimension) => void;
};

const SceneContext = createContext<SceneContextValue | null>(null);

export function MapSceneProvider({ children }: { children: ReactNode }) {
  const [scene, setScene] = useState<MapScene | null>(null);
  const [camera, setCamera] = useState<CameraRequest>({ target: "design", seq: 0 });
  const [dimension, setDimension] = useState<MapDimension>(INITIAL_DIMENSION);
  const placeClickRef = useRef<((id: string) => void) | null>(null);
  const viewportRef = useRef<((viewport: MapViewport) => void) | null>(null);

  const moveCamera = useCallback((target: CameraTarget, at?: LngLat) => {
    setCamera((current) => ({ target, seq: current.seq + 1, at }));
  }, []);

  const value = useMemo(
    () => ({ scene, setScene, placeClickRef, viewportRef, camera, moveCamera, dimension, setDimension }),
    [scene, camera, moveCamera, dimension]
  );

  return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;
}

export function useSceneContext(): SceneContextValue {
  const context = useContext(SceneContext);
  if (!context) throw new Error("Map screens must be rendered inside MapSceneProvider");
  return context;
}

/** Called by a map screen to describe what the map should show, and what tapping a marker does. */
export function useMapScene(scene: MapScene, onPlaceClick?: (id: string) => void): void {
  const { setScene, placeClickRef } = useSceneContext();
  const key = JSON.stringify(scene);

  useEffect(() => {
    setScene(JSON.parse(key) as MapScene);
  }, [key, setScene]);

  // Leaving a map screen clears its scene, which hides the shared map until the next map screen.
  // Moving straight to another map screen sets the new scene in the same commit, so nothing flickers.
  useEffect(() => () => setScene(null), [setScene]);

  useEffect(() => {
    placeClickRef.current = onPlaceClick ?? null;
    return () => {
      placeClickRef.current = null;
    };
  }, [onPlaceClick, placeClickRef]);
}

/**
 * Called by a map screen that loads Places for the visible area: `onViewport` runs each time the guest stops moving
 * the map (Mapbox `moveend`), and once when the map first settles. Only one screen listens at a time.
 */
export function useMapViewport(onViewport: (viewport: MapViewport) => void): void {
  const { viewportRef } = useSceneContext();
  useEffect(() => {
    viewportRef.current = onViewport;
    return () => {
      if (viewportRef.current === onViewport) viewportRef.current = null;
    };
  }, [onViewport, viewportRef]);
}
