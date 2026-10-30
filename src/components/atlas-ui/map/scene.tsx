"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { PlaceId, RouteId } from "../fixtures";
import type { MarkerImage } from "./markers";

/*
 * What the single shared map shows. Map screens (home, route, next stop) describe a scene and
 * the map applies it, so moving between those screens updates one Mapbox instance instead of
 * creating a new one.
 */

export type ScenePlace = { id: PlaceId; marker: MarkerImage };

export type MapScene = {
  places: ScenePlace[];
  hotel: boolean;
  you: boolean;
  /** Draws the walking route from Hotel A to this destination. */
  route?: RouteId;
  /**
   * Phone layout: how much of the bottom of the screen the screen's sheet (and the bar) covers,
   * so Mapbox's attribution stays visible and routes are framed above it.
   */
  bottomInset: number;
  /** In the wide layout this screen's sheet becomes a side panel on the left of the map. */
  panel: boolean;
  /** Route screens show a flat map; the home screen honours the 2D/3D toggle. */
  allowTilt: boolean;
};

export type CameraTarget = "design" | "you" | "hotel";
export type MapDimension = "2D" | "3D";

/**
 * The design's map-dimension button reads "2D" on the home screen — it shows the mode you can
 * switch to — so the map starts tilted in 3D. Change this to "2D" to start flat.
 */
export const INITIAL_DIMENSION: MapDimension = "3D";

type SceneContextValue = {
  scene: MapScene | null;
  setScene: (scene: MapScene) => void;
  placeClickRef: React.RefObject<((id: PlaceId) => void) | null>;
  camera: { target: CameraTarget; seq: number };
  moveCamera: (target: CameraTarget) => void;
  dimension: MapDimension;
  setDimension: (dimension: MapDimension) => void;
};

const SceneContext = createContext<SceneContextValue | null>(null);

export function MapSceneProvider({ children }: { children: ReactNode }) {
  const [scene, setScene] = useState<MapScene | null>(null);
  const [camera, setCamera] = useState<{ target: CameraTarget; seq: number }>({ target: "design", seq: 0 });
  const [dimension, setDimension] = useState<MapDimension>(INITIAL_DIMENSION);
  const placeClickRef = useRef<((id: PlaceId) => void) | null>(null);

  const moveCamera = useCallback((target: CameraTarget) => {
    setCamera((current) => ({ target, seq: current.seq + 1 }));
  }, []);

  const value = useMemo(
    () => ({ scene, setScene, placeClickRef, camera, moveCamera, dimension, setDimension }),
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
export function useMapScene(scene: MapScene, onPlaceClick?: (id: PlaceId) => void): void {
  const { setScene, placeClickRef } = useSceneContext();
  const key = JSON.stringify(scene);

  useEffect(() => {
    setScene(JSON.parse(key) as MapScene);
  }, [key, setScene]);

  useEffect(() => {
    placeClickRef.current = onPlaceClick ?? null;
    return () => {
      placeClickRef.current = null;
    };
  }, [onPlaceClick, placeClickRef]);
}
