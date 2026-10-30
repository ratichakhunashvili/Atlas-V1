"use client";

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

export function AtlasMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const engineRef = useRef<typeof import("./engine") | null>(null);
  const framedRouteRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(TOKEN ? null : "missing-token");
  const { scene, placeClickRef, camera, dimension } = useSceneContext();
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
          if (placeClickRef.current) placeClickRef.current(placeId as never);
        },
      });
    })().catch(() => setFailed("load"));

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [placeClickRef]);

  // Apply the scene.
  useEffect(() => {
    const map = mapRef.current;
    const engine = engineRef.current;
    if (!map || !engine || !ready || !scene) return;
    framedRouteRef.current = engine.applyScene(map, containerRef.current, scene, { wide, framedRoute: framedRouteRef.current });
  }, [scene, ready, wide]);

  // 2D / 3D.
  useEffect(() => {
    const map = mapRef.current;
    const engine = engineRef.current;
    if (!map || !engine || !ready || !scene) return;
    engine.applyDimension(map, scene.allowTilt && dimension === "3D", reducedMotion);
  }, [dimension, ready, scene, reducedMotion]);

  // Camera requests from the map controls.
  useEffect(() => {
    const map = mapRef.current;
    const engine = engineRef.current;
    if (!map || !engine || !ready || camera.seq === 0) return;
    engine.applyCamera(map, camera.target, reducedMotion);
  }, [camera, ready, reducedMotion]);

  return (
    <div className="atlas-map absolute inset-0 bg-atlas-dune">
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
