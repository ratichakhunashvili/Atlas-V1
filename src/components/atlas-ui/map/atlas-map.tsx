"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Map as MapboxMap } from "mapbox-gl/esm";
import "mapbox-gl/dist/mapbox-gl.css";
import { useSceneContext } from "./scene";
import { useReducedMotion, useWideLayout } from "../use-layout";

/*
 * The one Mapbox map instance behind every map screen. It is created once, when the first map
 * screen mounts, and stays alive while the guest moves between map screens; screens change what
 * it shows through the scene context. Places are a single GeoJSON source drawn by one symbol
 * layer with the marker images registered in markers.ts. The map engine (engine.ts) loads
 * lazily together with mapbox-gl, so screens that never show the map do not download it.
 */

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

/** Routes drawn over the map (the screens in app/(guest)/(map) that call useMapScene). */
const MAP_SCREEN = /^\/(?:$|directions|route|map\/)/;

export function AtlasMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const engineRef = useRef<typeof import("./engine") | null>(null);
  const framedRouteRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(TOKEN ? null : "missing-token");
  const { scene, placeClickRef, viewportRef, camera, dimension } = useSceneContext();
  const wide = useWideLayout();
  const reducedMotion = useReducedMotion();

  // Create the map once.
  useEffect(() => {
    if (!TOKEN || !containerRef.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const [mapboxgl, [engine, bitmaps]] = await Promise.all([
        import("mapbox-gl/esm"),
        import("./engine").then((e) => e.rasterizeMarkers().then((b) => [e, b] as const)),
      ]);
      if (cancelled || !containerRef.current) return;
      mapboxgl.setAccessToken(TOKEN);
      engineRef.current = engine;

      mapRef.current = engine.createAtlasMap(mapboxgl, containerRef.current, bitmaps, {
        onReady: () => {
          if (!cancelled) setReady(true);
        },
        onUnauthorized: () => setFailed("unauthorized"),
        onPlaceClick: (placeId) => {
          if (placeClickRef.current) placeClickRef.current(placeId);
        },
        onViewport: (viewport) => {
          if (viewportRef.current) viewportRef.current(viewport);
        },
      });
    })().catch(() => setFailed("load"));

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [placeClickRef, viewportRef]);

  // Mapbox's logo sits above the screen's sheet. Placed as soon as the scene is known, not after
  // the style has loaded, so the logo doesn't appear at the bottom first and then jump up.
  useEffect(() => {
    if (!scene || !containerRef.current) return;
    containerRef.current.style.setProperty("--atlas-map-inset", wide ? "0px" : `calc(${scene.bottomInset}px + env(safe-area-inset-bottom))`);
  }, [scene, wide]);

  // Shown again after a tab that had no map: the window may have changed size while it was hidden.
  // Also kept visible while a map screen is still loading (no scene yet), so returning to
  // Missions shows the map at once instead of a blank background.
  const pathname = usePathname();
  const visible = scene !== null || MAP_SCREEN.test(pathname);
  useEffect(() => {
    if (visible && ready) mapRef.current?.resize();
  }, [visible, ready]);

  // Apply the scene.
  useEffect(() => {
    const map = mapRef.current;
    const engine = engineRef.current;
    if (!map || !engine || !ready || !scene) return;
    framedRouteRef.current = engine.applyScene(map, containerRef.current, scene, { wide, framedRoute: framedRouteRef.current });
    // A screen coming back to a map that didn't move gets no `moveend`, so report the current area here too
    // (the listening screen ignores an area it has already loaded).
    const bounds = map.getBounds();
    if (bounds && viewportRef.current) {
      viewportRef.current({ south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() });
    }
  }, [scene, ready, wide, viewportRef]);

  // 2D / 3D.
  useEffect(() => {
    const map = mapRef.current;
    const engine = engineRef.current;
    if (!map || !engine || !ready || !scene) return;
    engine.applyDimension(map, scene.allowTilt && dimension === "3D", reducedMotion);
  }, [dimension, ready, scene, reducedMotion]);

  // The live scene's hotel, read by camera requests without making every scene change move the camera.
  const hotelAtRef = useRef<[number, number] | undefined>(undefined);
  useEffect(() => {
    hotelAtRef.current = scene?.hotelAt;
  }, [scene]);

  // Camera requests from the map controls.
  useEffect(() => {
    const map = mapRef.current;
    const engine = engineRef.current;
    if (!map || !engine || !ready || camera.seq === 0) return;
    engine.applyCamera(map, camera.target, reducedMotion, hotelAtRef.current);
  }, [camera, ready, reducedMotion]);

  return (
    // Hidden (not unmounted) on screens without a scene. Mapbox only draws when something changes,
    // so a hidden, idle map costs no rendering work while the guest is on another tab.
    <div className={`atlas-map absolute inset-0 bg-atlas-dune ${visible ? "" : "invisible"}`} aria-hidden={visible ? undefined : true}>
      {/* mapbox-gl.css makes the container position: relative, so size it explicitly. */}
      <div ref={containerRef} className="h-full w-full" />
      {!ready && !failed ? (
        <p role="status" className="absolute left-1/2 top-[38%] w-[240px] -translate-x-1/2 text-center font-manrope text-[13px] leading-[18px] text-atlas-slate">
          Loading the map…
        </p>
      ) : null}
      {failed ? (
        <p role="alert" className="absolute left-1/2 top-1/2 w-[280px] -translate-x-1/2 -translate-y-1/2 text-center font-manrope text-[13px] leading-[18px] text-atlas-slate">
          {failed === "missing-token"
            ? "The map needs a Mapbox token. Configure NEXT_PUBLIC_MAPBOX_TOKEN in your environment."
            : "The map could not load. Check the Mapbox token and your connection."}
        </p>
      ) : null}
    </div>
  );
}
