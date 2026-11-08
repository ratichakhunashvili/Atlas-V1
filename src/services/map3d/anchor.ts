import * as THREE from "three";

/**
 * Where a model sits in the world.
 *
 * Isolated from Mapbox on purpose: `mapbox-gl` needs a browser, and this is the
 * one piece of 3D code whose correctness can be checked by arithmetic rather than
 * by looking at a screen. If a model drifts across the map as you pan, or floats
 * above the ground, the mistake is almost always here — so here is where the tests
 * are.
 *
 * **Axis convention, used everywhere in services/map3d and components/map3d:**
 *
 *     model +X -> east,  model +Y -> up,  model +Z -> south
 *
 * Mapbox's Mercator space has +x east, +y SOUTH and +z up (altitude). The
 * matrices below map model Y to Mercator z and model Z to Mercator y, so models
 * authored Y-up (the glTF default) stand upright without per-model fudging.
 */

/** WGS84 equatorial circumference in metres, as Mapbox uses it. */
const EARTH_CIRCUMFERENCE_METERS = 40_075_016.686;

export type Mercator = { x: number; y: number; z: number };

/**
 * Web Mercator position in Mapbox's unit square, where the whole world spans
 * 0..1. Mirrors `mapboxgl.MercatorCoordinate.fromLngLat` so the two agree without
 * importing the browser library here.
 */
export function lngLatToMercator(lng: number, lat: number, altitudeMeters = 0): Mercator {
  const x = (180 + lng) / 360;
  const y = (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;

  return { x, y, z: altitudeMeters / mercatorScaleAtLatitude(lat) };
}

/**
 * How many Mercator units one metre spans at this latitude.
 *
 * Mercator stretches away from the equator, so a metre is a smaller fraction of
 * the unit square the further north you go. Using one fixed scale is what makes
 * models the wrong size in Georgia while looking right on the equator.
 */
export function meterInMercatorUnits(lat: number): number {
  return 1 / mercatorScaleAtLatitude(lat);
}

function mercatorScaleAtLatitude(lat: number): number {
  return EARTH_CIRCUMFERENCE_METERS * Math.cos((lat * Math.PI) / 180);
}

export type ModelTransform = {
  /** Heading (yaw): degrees clockwise from north, as an admin sets it. */
  rotationDegrees?: number;
  /** Tilt about the east-west axis, degrees. Default 0. */
  pitchDegrees?: number;
  /** Roll about the north-south axis, degrees. Default 0. */
  rollDegrees?: number;
  /** Per-axis stretch in MODEL space (before rotation), on top of `scale`. Default 1,1,1. */
  axisScale?: { x?: number; y?: number; z?: number };
  /** Metres above (or below) the anchor point. */
  elevationOffsetMeters?: number;
  /** Multiplier applied after the model has been normalised to its target height. */
  scale?: number;
};

/**
 * Model space -> Mercator space for a model drawn at `origin`: the origin's position, its metre scale, and the axis
 * swap. Model +X east -> Mercator +x; model +Y up -> Mercator +z (altitude); model +Z south -> Mercator +y.
 *
 * The swap is a reflection (Mercator space is left-handed with z up), which is exactly what keeps a right-handed,
 * Y-up glTF upright and unmirrored. A plain Y flip would lay the model on its back.
 */
export function buildOriginMatrix(lng: number, lat: number): THREE.Matrix4 {
  const origin = lngLatToMercator(lng, lat);
  const m = meterInMercatorUnits(lat);
  // Columns: model X -> (m,0,0), model Y -> (0,0,m), model Z -> (0,m,0); then translate.
  return new THREE.Matrix4().set(
    m, 0, 0, origin.x,
    0, 0, m, origin.y,
    0, m, 0, origin.z,
    0, 0, 0, 1
  );
}

/**
 * A model's matrix in METRES relative to a render origin (east, up, south). Everything the GPU sees stays in metres
 * near zero, which float32 holds precisely; the huge Mercator numbers are folded into the camera on the CPU in float64
 * (see the models layer). Drawing straight in Mercator units is what made models shake as the camera moved.
 */
export function buildLocalMatrix(
  origin: { lng: number; lat: number },
  lng: number,
  lat: number,
  transform: ModelTransform = {}
): THREE.Matrix4 {
  const here = lngLatToMercator(lng, lat);
  const base = lngLatToMercator(origin.lng, origin.lat);
  const metre = meterInMercatorUnits(origin.lat);
  const east = (here.x - base.x) / metre;
  const south = (here.y - base.y) / metre;
  const up = transform.elevationOffsetMeters ?? 0;

  const translation = new THREE.Matrix4().makeTranslation(east, up, south);
  // Heading is clockwise from north seen from above; about +Y (up) a positive angle turns anticlockwise, hence the minus.
  const yaw = new THREE.Matrix4().makeRotationY(-THREE.MathUtils.degToRad(transform.rotationDegrees ?? 0));
  const pitch = new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(transform.pitchDegrees ?? 0));
  const roll = new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(transform.rollDegrees ?? 0));
  const uniform = transform.scale ?? 1;
  const axis = new THREE.Matrix4().makeScale(
    uniform * (transform.axisScale?.x ?? 1),
    uniform * (transform.axisScale?.y ?? 1),
    uniform * (transform.axisScale?.z ?? 1)
  );
  // T * Ryaw * Rpitch * Rroll * S: stretched along its own axes, turned, then placed.
  return translation.multiply(yaw).multiply(pitch).multiply(roll).multiply(axis);
}

/**
 * The full model -> Mercator matrix for one model (origin at its own anchor). For maths and tests; the layer draws
 * with origin-relative matrices instead.
 */
export function buildAnchorMatrix(lng: number, lat: number, transform: ModelTransform = {}): THREE.Matrix4 {
  return buildOriginMatrix(lng, lat).multiply(buildLocalMatrix({ lng, lat }, lng, lat, transform));
}

/** How high a floating model hovers when the admin has not raised it themselves. */
export const FLOATING_DEFAULT_LIFT_METERS = 15;
/** How far a floating model drifts up and down, and how long one full bob takes. */
export const FLOATING_BOB_AMPLITUDE_METERS = 0.8;
export const FLOATING_BOB_PERIOD_MS = 4000;

/**
 * The height a model is drawn at. Grounded models use the admin's offset as is. Floating models hover: at the admin's
 * height when it is above the ground, otherwise at a default lift so the switch alone is enough.
 */
export function effectiveElevation(elevationOffsetMeters: number, floating: boolean): number {
  if (!floating) return elevationOffsetMeters;
  return elevationOffsetMeters > 0 ? elevationOffsetMeters : FLOATING_DEFAULT_LIFT_METERS;
}

/** The bob's vertical offset at a moment in time, in metres: a slow sine, zero at time zero. */
export function bobOffsetMeters(timeMs: number): number {
  return Math.sin((timeMs / FLOATING_BOB_PERIOD_MS) * 2 * Math.PI) * FLOATING_BOB_AMPLITUDE_METERS;
}

/**
 * Where to put a loaded model inside its placement so its BASE sits on the anchor and its footprint is centred on it,
 * whatever origin the file was exported with. (Assuming a centred file left models floating or half-buried.)
 */
export function groundingPosition(
  bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } },
  scale: number
): { x: number; y: number; z: number } {
  if (![bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.z, scale].every(Number.isFinite)) return { x: 0, y: 0, z: 0 };
  return {
    x: -((bounds.min.x + bounds.max.x) / 2) * scale + 0,
    y: -bounds.min.y * scale + 0,
    z: -((bounds.min.z + bounds.max.z) / 2) * scale + 0,
  };
}

/**
 * The uniform scale that makes a model `targetHeightMeters` tall, from the height
 * of its own bounding box.
 *
 * GLB files arrive at wildly different scales — one exporter's "1 unit" is a
 * metre, another's is a centimetre. Normalising by measured height means an admin
 * sets "this tower is 40 m" instead of guessing a multiplier per file.
 */
export function scaleToTargetHeight(modelHeightUnits: number, targetHeightMeters: number): number {
  if (!Number.isFinite(modelHeightUnits) || modelHeightUnits <= 0) return 1;
  if (!Number.isFinite(targetHeightMeters) || targetHeightMeters <= 0) return 1;

  return targetHeightMeters / modelHeightUnits;
}

/**
 * How far to lift a model so its base sits on the ground rather than halfway
 * through it: half its height, since a centred bounding box puts the origin in
 * the middle.
 */
export function groundingOffset(modelHeightUnits: number, scale: number): number {
  if (!Number.isFinite(modelHeightUnits) || !Number.isFinite(scale)) return 0;
  return (modelHeightUnits * scale) / 2;
}
