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
 * Mapbox's Mercator space has +Y increasing SOUTHWARD and no vertical axis in the
 * usual sense, so the matrix below flips Y to get a conventional "up" and leaves
 * +Z pointing south. Models authored Y-up (the GLB default) therefore stand
 * upright without per-model fudging.
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
 * The model-space -> Mercator-space matrix for one placed object.
 *
 * Composed by hand, in this order, because the scale is NON-UNIFORM: the Y flip
 * that turns Mapbox's southward +Y into a conventional "up" has to be part of the
 * scale, not the rotation. three.js's own position/rotation/scale properties
 * compose as T·R·S, which would bake the flip into the rotation and produce a
 * mirrored, subtly wrong result.
 *
 * Crucially this is the ONLY place an object's world position comes from, and it
 * is computed once at placement time from the Place's own longitude and latitude —
 * never from screen pixels. That is what keeps a model pinned to its building
 * while the camera pans, zooms, pitches and rotates around it.
 */
export function buildAnchorMatrix(
  lng: number,
  lat: number,
  transform: ModelTransform = {}
): THREE.Matrix4 {
  const elevation = transform.elevationOffsetMeters ?? 0;
  const anchor = lngLatToMercator(lng, lat, elevation);
  const metersToMercator = meterInMercatorUnits(lat) * (transform.scale ?? 1);

  const translation = new THREE.Matrix4().makeTranslation(anchor.x, anchor.y, anchor.z);

  // Non-uniform on purpose: Y is negated so model-up becomes screen-up.
  const scale = new THREE.Matrix4().makeScale(metersToMercator, -metersToMercator, metersToMercator);

  // Heading about vertical, then tilt, then roll: yaw is the outermost rotation, so a pitched model still turns about
  // the vertical axis the way an admin expects when they change its heading.
  const yaw = new THREE.Matrix4().makeRotationY(THREE.MathUtils.degToRad(transform.rotationDegrees ?? 0));
  const pitch = new THREE.Matrix4().makeRotationX(THREE.MathUtils.degToRad(transform.pitchDegrees ?? 0));
  const roll = new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(transform.rollDegrees ?? 0));
  const rotation = yaw.multiply(pitch).multiply(roll);

  // Per-axis scale is the innermost step: it stretches the model along ITS OWN axes before it is rotated or placed.
  const axis = new THREE.Matrix4().makeScale(
    transform.axisScale?.x ?? 1,
    transform.axisScale?.y ?? 1,
    transform.axisScale?.z ?? 1
  );

  // T · S · R · A — the flip scale is applied after rotation and before translation, never the other way round.
  return translation.multiply(scale).multiply(rotation).multiply(axis);
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
