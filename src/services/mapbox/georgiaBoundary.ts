import boundaryFeature from "./data/georgia-boundary.json";
import { boundingBoxOf } from "./geo";

/** Simplified Georgia country polygon (~23 vertices) used for the mask and bounds. Not survey-accurate — good enough for a visual "unlocked area" effect. */
export const GEORGIA_BOUNDARY = boundaryFeature as unknown as GeoJSON.Feature<GeoJSON.Polygon>;

const ring = GEORGIA_BOUNDARY.geometry.coordinates[0] as Array<[number, number]>;

export const GEORGIA_BBOX = boundingBoxOf(ring);

/** The strict country bounding box, used to FIT the initial camera so the whole of Georgia is clearly visible. Not a lock: the camera is free to move. */
export const GEORGIA_FIT_BOUNDS: [[number, number], [number, number]] = [
  [GEORGIA_BBOX.west, GEORGIA_BBOX.south],
  [GEORGIA_BBOX.east, GEORGIA_BBOX.north],
];

/** Degrees of padding around the strict country bbox (kept for reference; the map no longer hard-locks its bounds). */
const CAMERA_BUFFER_DEG = 0.45;

export const MAX_BOUNDS: [[number, number], [number, number]] = [
  [GEORGIA_BBOX.west - CAMERA_BUFFER_DEG, GEORGIA_BBOX.south - CAMERA_BUFFER_DEG],
  [GEORGIA_BBOX.east + CAMERA_BUFFER_DEG, GEORGIA_BBOX.north + CAMERA_BUFFER_DEG],
];

export const GEORGIA_CENTER: [number, number] = [
  (GEORGIA_BBOX.west + GEORGIA_BBOX.east) / 2,
  (GEORGIA_BBOX.south + GEORGIA_BBOX.north) / 2,
];

/** A large rectangle with the Georgia polygon punched out, rendered as a dim overlay outside the unlocked area. Two rings, ~30 points total — cheap to draw at any zoom. This is a visual effect only; it does not limit what data Atlas loads (the Place query's own radius/bbox filtering does that — see db/queries/places.ts). */
export function buildOutsideMask(): GeoJSON.Feature<GeoJSON.Polygon> {
  const outer: Array<[number, number]> = [
    [-25, 15],
    [70, 15],
    [70, 65],
    [-25, 65],
    [-25, 15],
  ];
  const hole = [...ring].reverse() as Array<[number, number]>;

  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "Polygon",
      coordinates: [outer, hole],
    },
  };
}
