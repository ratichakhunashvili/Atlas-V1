"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { Button } from "@/components/shared/button";
import { Field } from "@/components/shared/field";
import { MapService } from "@/services/mapbox/mapService";
import { mapThemeService } from "@/services/mapbox/mapTheme";
import { getPerformanceSettings } from "@/services/mapbox/performance";
import type { GuestPlaceModel } from "@/services/map3d/guest-models";
import {
  LARGE_SEPARATION_METERS,
  anchorSeparationMeters,
  isInsideSupportedRegion,
  requiresSeparationConfirmation,
} from "@/services/map3d/placement";
import { distanceMeters } from "@/lib/geo";
import { locationService, type Coordinates as GeoCoordinates } from "@/services/location";
import type { RouteGeometry } from "@/services/routing";

export type EditorModel = {
  fileUrl: string;
  status: "draft" | "enabled";
  targetHeightMeters: number;
  rotationDegrees: number;
  pitchDegrees: number;
  rollDegrees: number;
  elevationOffsetMeters: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  anchorLatitude: number | null;
  anchorLongitude: number | null;
};

type Place = { id: string; name: string; latitude: number; longitude: number; category: string };

type Values = {
  anchorLatitude: string;
  anchorLongitude: string;
  targetHeightMeters: string;
  rotationDegrees: string;
  pitchDegrees: string;
  rollDegrees: string;
  elevationOffsetMeters: string;
  scale: string;
  scaleX: string;
  scaleY: string;
  scaleZ: string;
};

const toValues = (model: EditorModel): Values => ({
  anchorLatitude: model.anchorLatitude === null ? "" : String(model.anchorLatitude),
  anchorLongitude: model.anchorLongitude === null ? "" : String(model.anchorLongitude),
  targetHeightMeters: String(model.targetHeightMeters),
  rotationDegrees: String(model.rotationDegrees),
  pitchDegrees: String(model.pitchDegrees),
  rollDegrees: String(model.rollDegrees),
  elevationOffsetMeters: String(model.elevationOffsetMeters),
  scale: String(model.scale),
  scaleX: String(model.scaleX),
  scaleY: String(model.scaleY),
  scaleZ: String(model.scaleZ),
});

/** A field that is blank or half-typed must not blow the preview up: it falls back to the saved value until it parses. */
function numberOr(value: string, fallback: number): number {
  if (value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Metres to degrees at a latitude, for nudging the anchor by a fixed distance. */
const METERS_PER_DEGREE_LAT = 111_320;
const metersToLat = (meters: number) => meters / METERS_PER_DEGREE_LAT;
const metersToLng = (meters: number, lat: number) => meters / (METERS_PER_DEGREE_LAT * Math.cos((lat * Math.PI) / 180));

/** Keeps typed numbers short: no 0.30000000000000004 in a field after a nudge. */
const tidy = (value: number, decimals: number) => String(Number(value.toFixed(decimals)));

/**
 * One transform value: a slider for dragging, a number box for exact values, and -/+ buttons for small steps. All three
 * edit the same form value; only the number box carries the `name`, so the server receives exactly one value.
 */
function SliderRow({
  label,
  name,
  value,
  onChange,
  min,
  max,
  step,
  nudge,
  unit,
  hint,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  step: number;
  nudge: number;
  unit?: string;
  hint?: string;
}) {
  const current = numberOr(value, 0);
  const decimals = step < 1 ? 2 : 0;
  const bump = (delta: number) => onChange(tidy(Math.min(max, Math.max(min, current + delta)), decimals));
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={name} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        {hint && <span className="text-xs text-slate-500">{hint}</span>}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => bump(-nudge)} aria-label={`${label}: minus ${nudge}${unit ?? ""}`} className="h-9 w-9 shrink-0 rounded-md border border-slate-300 text-lg leading-none hover:bg-slate-50">
          −
        </button>
        <input
          type="range"
          aria-label={`${label} slider`}
          min={min}
          max={max}
          step={step}
          value={Math.min(max, Math.max(min, current))}
          onChange={(event) => onChange(event.target.value)}
          className="h-9 min-w-0 flex-1 accent-slate-900"
        />
        <button type="button" onClick={() => bump(nudge)} aria-label={`${label}: plus ${nudge}${unit ?? ""}`} className="h-9 w-9 shrink-0 rounded-md border border-slate-300 text-lg leading-none hover:bg-slate-50">
          +
        </button>
        <input
          id={name}
          name={name}
          type="number"
          step="any"
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="block w-20 shrink-0 rounded-md border border-slate-300 px-2 py-2 text-right text-sm shadow-sm focus:border-slate-500 focus:outline-none"
        />
        {unit && <span className="w-4 shrink-0 text-xs text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

function formatMeters(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(2)} km`;
}

/**
 * The model placement editor: a live map with the linked Place's REAL pin and the model's independent display
 * anchor, numeric controls for everything, and a live preview of the model drawn with the same layer guests see.
 *
 * What it can and cannot do, which is the point of the screen:
 *  - The anchor is a geographic coordinate pair. It is never stored as a screen position, so it stays put through
 *    pan, zoom, pitch, bearing, resize and style changes.
 *  - Moving it never moves the Place. The Place pin stays at the Place's own coordinates (the canonical location
 *    that eligibility, navigation, check-in and the achievement use); the distance between them is shown, and a large
 *    one needs an explicit confirmation before it can be saved.
 *  - "Placement mode" is explicit. With it off the map pans and zooms freely and the anchor is locked; with it on the
 *    anchor can be dragged and map dragging is switched off, so the drag moves the model rather than the map.
 *
 * It uses the app's one MapService (one Mapbox map, one Three.js layer, one renderer) — never a map or renderer per model.
 */
export function PlacementEditor({
  action,
  model,
  place,
  region,
}: {
  action: (formData: FormData) => void | Promise<void>;
  model: EditorModel;
  place: Place;
  region: { minLat: number; maxLat: number; minLng: number; maxLng: number };
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const serviceRef = useRef<MapService | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);

  const [values, setValues] = useState<Values>(() => toValues(model));
  const [placementMode, setPlacementMode] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [confirmedSeparation, setConfirmedSeparation] = useState(false);
  const [nudgeMeters, setNudgeMeters] = useState(1);
  const [me, setMe] = useState<{ coords: GeoCoordinates; accuracy: number | null } | null>(null);
  const [locationNote, setLocationNote] = useState<string | null>(null);

  const set = useCallback((key: keyof Values, value: string) => setValues((current) => ({ ...current, [key]: value })), []);

  // What the model would look like if saved right now. Falls back to the saved value for anything unparsable.
  const anchorLat = values.anchorLatitude.trim() === "" ? null : numberOr(values.anchorLatitude, model.anchorLatitude ?? place.latitude);
  const anchorLng = values.anchorLongitude.trim() === "" ? null : numberOr(values.anchorLongitude, model.anchorLongitude ?? place.longitude);
  const anchorIsSet = anchorLat !== null && anchorLng !== null;
  const drawLat = anchorIsSet ? anchorLat : place.latitude;
  const drawLng = anchorIsSet ? anchorLng : place.longitude;

  const separation = useMemo(
    () =>
      anchorSeparationMeters(
        { anchorLatitude: anchorIsSet ? anchorLat : null, anchorLongitude: anchorIsSet ? anchorLng : null },
        { latitude: place.latitude, longitude: place.longitude }
      ),
    [anchorIsSet, anchorLat, anchorLng, place.latitude, place.longitude]
  );
  const needsConfirmation = requiresSeparationConfirmation(separation);
  const insideRegion = !anchorIsSet || isInsideSupportedRegion(anchorLat, anchorLng);

  const preview: GuestPlaceModel = useMemo(
    () => ({
      placeId: place.id,
      fileUrl: model.fileUrl,
      latitude: place.latitude,
      longitude: place.longitude,
      anchorLatitude: drawLat,
      anchorLongitude: drawLng,
      displacementMeters: Math.round(separation),
      targetHeightMeters: Math.max(numberOr(values.targetHeightMeters, model.targetHeightMeters), 0.1),
      rotationDegrees: numberOr(values.rotationDegrees, model.rotationDegrees),
      pitchDegrees: numberOr(values.pitchDegrees, model.pitchDegrees),
      rollDegrees: numberOr(values.rollDegrees, model.rollDegrees),
      elevationOffsetMeters: numberOr(values.elevationOffsetMeters, model.elevationOffsetMeters),
      scale: Math.max(numberOr(values.scale, model.scale), 0.01),
      scaleX: Math.max(numberOr(values.scaleX, model.scaleX), 0.01),
      scaleY: Math.max(numberOr(values.scaleY, model.scaleY), 0.01),
      scaleZ: Math.max(numberOr(values.scaleZ, model.scaleZ), 0.01),
      // The editor always shows the model in colour: an admin is placing it, not earning it.
      unlocked: true,
    }),
    [drawLat, drawLng, model, place, separation, values]
  );

  // Mount the one map, once.
  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    // Models are skipped on low-powered devices in guest maps; here the admin has asked to see one.
    const service = new MapService(containerRef.current, mapThemeService.getTheme(), { ...getPerformanceSettings(), profile: "medium" }, null);
    serviceRef.current = service;

    service
      .initialize()
      .then((map) => {
        if (cancelled) {
          service.destroy();
          return;
        }

        // The Place's own pin — drawn at its canonical coordinates and NEVER moved by this editor.
        service.updatePlaces({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: { id: place.id, name: place.name, category: place.category as never },
              geometry: { type: "Point", coordinates: [place.longitude, place.latitude] },
            },
          ],
        });
        service.frameOn({ lng: place.longitude, lat: place.latitude }, 17, 55);

        const element = document.createElement("button");
        element.type = "button";
        element.className = "atlas-anchor-marker";
        element.textContent = "3D";
        element.title = "The model's display anchor";
        element.setAttribute("aria-label", "3D model display anchor");
        const marker = new mapboxgl.Marker({ element, draggable: false }).setLngLat([drawLng, drawLat]).addTo(map);
        markerRef.current = marker;

        // Dragging writes geographic coordinates into the form, in place of any pixel position.
        const onDrag = () => {
          const { lng, lat } = marker.getLngLat();
          setValues((current) => ({ ...current, anchorLatitude: lat.toFixed(6), anchorLongitude: lng.toFixed(6) }));
        };
        marker.on("drag", onDrag);
        marker.on("dragend", onDrag);

        cleanups.push(mapThemeService.onChange((theme) => service.setMapTheme(theme)));
        // The preview and placement-mode effects below wait for this, then run for the first time.
        setMapReady(true);
      })
      .catch((error: unknown) => {
        if (!cancelled) setMapError(error instanceof Error ? error.message : "The map could not load.");
      });

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
      markerRef.current?.remove();
      markerRef.current = null;
      serviceRef.current?.destroy();
      serviceRef.current = null;
    };
    // The map is created exactly once; later changes flow in through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live preview + marker position follow the form. Cheap: the layer diffs, and a placement-only change moves the object in place.
  useEffect(() => {
    const service = serviceRef.current;
    if (!service || !mapReady) return;

    service.updateModels([preview]);
    markerRef.current?.setLngLat([drawLng, drawLat]);

    // A dashed line between the real pin and the drawn model, so the displacement is visible, not just a number.
    const line: RouteGeometry | null =
      separation >= 1
        ? {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: [[place.longitude, place.latitude], [drawLng, drawLat]] },
          }
        : null;
    service.updateLeg(line);
  }, [mapReady, preview, drawLat, drawLng, separation, place.latitude, place.longitude]);

  // Placement mode: the anchor is draggable and the map is NOT, or the other way round. Never both at once.
  useEffect(() => {
    const map = serviceRef.current?.getMapOrNull();
    const marker = markerRef.current;
    if (!map || !marker) return;
    marker.setDraggable(placementMode);
    if (placementMode) map.dragPan.disable();
    else map.dragPan.enable();
  }, [mapReady, placementMode]);

  // The admin's own live position, for as long as the editor is open: the shared location service, one watch.
  useEffect(() => {
    const unsubscribe = locationService.onChange((state) => {
      if (state.coords) {
        setMe({ coords: state.coords, accuracy: state.accuracy });
        setLocationNote(null);
      } else if (state.status === "denied") setLocationNote("Location is blocked for this site. Allow it in the browser to see yourself on the map.");
      else if (state.status === "unavailable" || state.status === "timeout" || state.status === "error") setLocationNote("Your location isn't available right now.");
    });
    locationService.start();
    return () => {
      unsubscribe();
      locationService.stop();
    };
  }, []);

  useEffect(() => {
    if (!mapReady || !me) return;
    serviceRef.current?.setUserLocation({ lng: me.coords.longitude, lat: me.coords.latitude }, me.accuracy);
  }, [mapReady, me]);

  function showMe() {
    if (!me) {
      void locationService.requestPermission();
      setLocationNote("Finding you…");
      return;
    }
    serviceRef.current?.centerOnUser({ lng: me.coords.longitude, lat: me.coords.latitude }, { force: true });
  }

  function placeAtMe() {
    if (!me) return;
    setValues((current) => ({ ...current, anchorLatitude: me.coords.latitude.toFixed(6), anchorLongitude: me.coords.longitude.toFixed(6) }));
  }

  /** Moves the anchor a fixed number of metres north (+) / east (+), from wherever it is drawn now. */
  function nudgeAnchor(northMeters: number, eastMeters: number) {
    setValues((current) => ({
      ...current,
      anchorLatitude: (drawLat + metersToLat(northMeters)).toFixed(7),
      anchorLongitude: (drawLng + metersToLng(eastMeters, drawLat)).toFixed(7),
    }));
  }

  function turn(degrees: number) {
    const next = (((numberOr(values.rotationDegrees, 0) + degrees) % 360) + 360) % 360;
    set("rotationDegrees", tidy(next, 1));
  }

  function reset() {
    setValues(toValues(model));
    setConfirmedSeparation(false);
  }

  function useThePlace() {
    setValues((current) => ({ ...current, anchorLatitude: "", anchorLongitude: "" }));
    setConfirmedSeparation(false);
  }

  const distanceFromPlaceToCamera = anchorIsSet ? distanceMeters({ lat: place.latitude, lng: place.longitude }, { lat: drawLat, lng: drawLng }) : 0;

  return (
    <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start lg:gap-6 lg:space-y-0">
      <section aria-label="Placement map" className="space-y-2 lg:sticky lg:top-4">
        <div className="relative overflow-hidden rounded-xl border border-slate-300">
          <div ref={containerRef} className="h-[22rem] w-full sm:h-[28rem] lg:h-[calc(100vh-16rem)] lg:min-h-[28rem]" />
          {mapError && (
            <p role="alert" className="absolute inset-x-3 top-3 rounded-md bg-red-50 p-3 text-sm text-red-700">
              The live map is unavailable ({mapError}). You can still edit every value below and save; the server checks
              them.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant={placementMode ? "primary" : "secondary"}
            aria-pressed={placementMode}
            onClick={() => setPlacementMode((on) => !on)}
          >
            {placementMode ? "Placement mode: on — drag the 3D marker" : "Placement mode: off"}
          </Button>
          <p className="text-xs text-slate-500">
            {placementMode
              ? "Dragging moves the model's anchor. The map itself is locked while this is on."
              : "The map pans and zooms freely. Turn placement mode on to drag the anchor."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={showMe}>
            Show my location
          </Button>
          <Button type="button" variant="secondary" onClick={placeAtMe} disabled={!me}>
            Put the model where I am
          </Button>
          <p className="text-xs text-slate-500" aria-live="polite">
            {locationNote ?? (me ? `You are the blue dot (±${Math.round(me.accuracy ?? 0)} m).` : "Waiting for your location…")}
          </p>
        </div>

        <dl className="grid gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-3" aria-live="polite">
          <div>
            <dt className="font-medium text-slate-700">Real place (pin)</dt>
            <dd>
              {place.latitude.toFixed(6)}, {place.longitude.toFixed(6)}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Model anchor</dt>
            <dd>{anchorIsSet ? `${drawLat.toFixed(6)}, ${drawLng.toFixed(6)}` : "at the place"}</dd>
          </div>
          <div>
            <dt className="font-medium text-slate-700">Distance between them</dt>
            <dd>{formatMeters(distanceFromPlaceToCamera)}</dd>
          </div>
        </dl>
        <p className="text-xs text-slate-500">
          Moving the model never moves the place. The pin, directions, check-in, eligibility and the achievement all keep
          using the real location.
        </p>
      </section>

      <form action={action} className="space-y-6 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto lg:pr-1">
        <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <legend className="px-1 text-sm font-semibold text-slate-900">Anchor (where it is drawn)</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Latitude" name="anchorLatitude" type="number" step="any" inputMode="decimal" value={values.anchorLatitude} onChange={(event) => set("anchorLatitude", event.target.value)} />
            <Field label="Longitude" name="anchorLongitude" type="number" step="any" inputMode="decimal" value={values.anchorLongitude} onChange={(event) => set("anchorLongitude", event.target.value)} />
          </div>
          <p className="text-xs text-slate-500">
            Leave both blank to draw it at the place. Anchors must be inside Georgia ({region.minLat}–{region.maxLat}°N,{" "}
            {region.minLng}–{region.maxLng}°E).
          </p>
          {!insideRegion && (
            <p role="alert" className="text-sm text-red-600">
              That anchor is outside the supported area and will be refused.
            </p>
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Move the model</p>
            <div className="flex flex-wrap items-center gap-4">
              <div className="grid w-36 grid-cols-3 gap-1" role="group" aria-label="Move the model by a step">
                <span />
                <button type="button" onClick={() => nudgeAnchor(nudgeMeters, 0)} className="h-10 rounded-md border border-slate-300 hover:bg-slate-50" aria-label={`North ${nudgeMeters} m`}>↑ N</button>
                <span />
                <button type="button" onClick={() => nudgeAnchor(0, -nudgeMeters)} className="h-10 rounded-md border border-slate-300 hover:bg-slate-50" aria-label={`West ${nudgeMeters} m`}>← W</button>
                <span className="flex items-center justify-center text-xs text-slate-500">{nudgeMeters} m</span>
                <button type="button" onClick={() => nudgeAnchor(0, nudgeMeters)} className="h-10 rounded-md border border-slate-300 hover:bg-slate-50" aria-label={`East ${nudgeMeters} m`}>E →</button>
                <span />
                <button type="button" onClick={() => nudgeAnchor(-nudgeMeters, 0)} className="h-10 rounded-md border border-slate-300 hover:bg-slate-50" aria-label={`South ${nudgeMeters} m`}>↓ S</button>
                <span />
              </div>
              <div className="space-y-1">
                <p className="text-xs text-slate-500">Step</p>
                <div className="flex gap-1">
                  {[0.5, 1, 5, 20].map((step) => (
                    <button
                      key={step}
                      type="button"
                      aria-pressed={nudgeMeters === step}
                      onClick={() => setNudgeMeters(step)}
                      className={`h-9 rounded-md border px-2 text-sm ${nudgeMeters === step ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 hover:bg-slate-50"}`}
                    >
                      {step} m
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <Button type="button" variant="secondary" onClick={useThePlace}>
            Use the place&apos;s location
          </Button>
        </fieldset>

        <fieldset className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <legend className="px-1 text-sm font-semibold text-slate-900">Transform</legend>
          <SliderRow label="Height" name="targetHeightMeters" unit="m" value={values.targetHeightMeters} onChange={(v) => set("targetHeightMeters", v)} min={1} max={150} step={0.5} nudge={1} hint="How tall it stands" />
          <div className="space-y-1">
            <SliderRow label="Heading" name="rotationDegrees" unit="°" value={values.rotationDegrees} onChange={(v) => set("rotationDegrees", v)} min={0} max={360} step={1} nudge={1} hint="Clockwise from north" />
            <div className="flex flex-wrap gap-1">
              {[-90, -15, 15, 90].map((degrees) => (
                <button key={degrees} type="button" onClick={() => turn(degrees)} className="h-8 rounded-md border border-slate-300 px-2 text-xs hover:bg-slate-50">
                  {degrees < 0 ? `⟲ ${-degrees}°` : `⟳ ${degrees}°`}
                </button>
              ))}
            </div>
          </div>
          <SliderRow label="Raise / lower" name="elevationOffsetMeters" unit="m" value={values.elevationOffsetMeters} onChange={(v) => set("elevationOffsetMeters", v)} min={-20} max={50} step={0.1} nudge={0.5} hint="0 = standing on the ground" />
          <SliderRow label="Size" name="scale" unit="×" value={values.scale} onChange={(v) => set("scale", v)} min={0.1} max={5} step={0.05} nudge={0.1} hint="Multiplier on top of the height" />

          <details className="rounded-md border border-slate-200 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700">Advanced: tilt and stretch</summary>
            <div className="mt-3 space-y-3">
              <SliderRow label="Pitch" name="pitchDegrees" unit="°" value={values.pitchDegrees} onChange={(v) => set("pitchDegrees", v)} min={-180} max={180} step={1} nudge={1} hint="Tips it forward or back" />
              <SliderRow label="Roll" name="rollDegrees" unit="°" value={values.rollDegrees} onChange={(v) => set("rollDegrees", v)} min={-180} max={180} step={1} nudge={1} hint="Tips it sideways" />
              <SliderRow label="Stretch X" name="scaleX" unit="×" value={values.scaleX} onChange={(v) => set("scaleX", v)} min={0.1} max={5} step={0.05} nudge={0.1} hint="Width" />
              <SliderRow label="Stretch Y" name="scaleY" unit="×" value={values.scaleY} onChange={(v) => set("scaleY", v)} min={0.1} max={5} step={0.05} nudge={0.1} hint="Height" />
              <SliderRow label="Stretch Z" name="scaleZ" unit="×" value={values.scaleZ} onChange={(v) => set("scaleZ", v)} min={0.1} max={5} step={0.05} nudge={0.1} hint="Depth" />
              <p className="text-xs text-slate-500">If the model looks tipped over, try a pitch of 90 or −90: some files are exported lying down.</p>
            </div>
          </details>
        </fieldset>

        {needsConfirmation && (
          <div role="alert" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4">
            <p className="text-sm font-semibold text-amber-900">This is far from the real place</p>
            <p className="text-xs text-amber-800">
              The model would be drawn about {formatMeters(separation)} from {place.name} (more than {LARGE_SEPARATION_METERS}{" "}
              m). Guests can tap it to open the place, which will say where the place really is — but check this is what you mean.
            </p>
            <label className="flex items-start gap-2 text-sm text-amber-900">
              <input
                type="checkbox"
                name="confirmLargeSeparation"
                checked={confirmedSeparation}
                onChange={(event) => setConfirmedSeparation(event.target.checked)}
                className="mt-1 h-4 w-4"
              />
              I mean to draw it this far from the real location.
            </label>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={reset}>
            Reset to saved
          </Button>
          <Button type="submit" name="status" value="draft" variant="secondary" disabled={needsConfirmation && !confirmedSeparation}>
            Save as draft
          </Button>
          <Button type="submit" name="status" value="enabled" disabled={needsConfirmation && !confirmedSeparation}>
            Publish to guests
          </Button>
        </div>
        <p className="text-xs text-slate-500">
          Currently {model.status === "enabled" ? "published" : "a draft"}. A draft is never sent to guests; publishing shows
          it only to guests whose hotel has approved this place.
        </p>
      </form>
    </div>
  );
}
