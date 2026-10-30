import type { PlaceModel } from "@/db/schema";
import { anchorSeparationMeters, resolveDisplayAnchor } from "./placement";

/**
 * What a guest's browser is allowed to know about the 3D models on their map.
 *
 * Two rules, both enforced here on the server rather than by how the client draws:
 *
 *  1. **Eligibility.** A model is only sent for a Place the guest's own hotel has
 *     approved. The model layer is not a second route into Atlas's catalogue.
 *  2. **Lock state.** Whether a model appears unlocked follows the guest's own
 *     PERMANENT VERIFIED VISIT to that Place — nothing else. Not itinerary-stop
 *     completion, not a client flag, not a styling choice.
 *
 * Hidden styling would not be enough: anything sent to a browser can be read, so
 * "locked" has to mean the server decided it, and the payload has to be the same
 * shape either way so the difference cannot be inferred from what is missing.
 *
 * Privileged fields never cross: `storageKey` is how a file is overwritten or
 * deleted, and the uploader's identity is nobody's business. Both are dropped
 * here, by construction, rather than trusted to a `select` elsewhere.
 */

export type GuestPlaceModel = {
  placeId: string;
  /** The model file to load. A public URL; the storage key behind it never leaves the server. */
  fileUrl: string;
  /** The Place's CANONICAL coordinates — where its pin is, and what navigation, check-in and eligibility use. Never the anchor. */
  latitude: number;
  longitude: number;
  /** Where the model is DRAWN. Equals the Place's coordinates unless an admin placed it elsewhere. Display only. */
  anchorLatitude: number;
  anchorLongitude: number;
  /** How far the drawn model sits from the real location, in metres (0 when not displaced). Lets the UI say so plainly. */
  displacementMeters: number;
  targetHeightMeters: number;
  rotationDegrees: number;
  pitchDegrees: number;
  rollDegrees: number;
  elevationOffsetMeters: number;
  scale: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  /** True only when THIS guest has a permanent verified visit to this Place. */
  unlocked: boolean;
};

export type ModelSource = {
  model: PlaceModel;
  place: { id: string; latitude: number; longitude: number };
};

/**
 * Builds the guest payload.
 *
 * `eligiblePlaceIds` comes from the eligibility service and `visitedPlaceIds` from
 * the guest's own permanent visits — both resolved server-side from the
 * authenticated session, never from a request parameter.
 *
 * Draft models are omitted entirely: an admin enables a model deliberately, and a
 * half-placed building should never reach a guest's map.
 */
export function buildGuestModels(input: {
  sources: readonly ModelSource[];
  eligiblePlaceIds: ReadonlySet<string>;
  visitedPlaceIds: ReadonlySet<string>;
}): GuestPlaceModel[] {
  return input.sources
    .filter(({ model, place }) => model.status === "enabled" && input.eligiblePlaceIds.has(place.id))
    .map(({ model, place }) => {
      const anchor = resolveDisplayAnchor(model, { latitude: place.latitude, longitude: place.longitude });
      return {
      placeId: place.id,
      fileUrl: model.fileUrl,
      latitude: place.latitude,
      longitude: place.longitude,
      anchorLatitude: anchor.latitude,
      anchorLongitude: anchor.longitude,
      displacementMeters: Math.round(anchorSeparationMeters(model, { latitude: place.latitude, longitude: place.longitude })),
      targetHeightMeters: model.targetHeightMeters,
      rotationDegrees: model.rotationDegrees,
      pitchDegrees: model.pitchDegrees,
      rollDegrees: model.rollDegrees,
      elevationOffsetMeters: model.elevationOffsetMeters,
      scale: model.scale,
      scaleX: model.scaleX,
      scaleY: model.scaleY,
      scaleZ: model.scaleZ,
      // The one source of unlock state: this guest's own verified visit.
      unlocked: input.visitedPlaceIds.has(place.id),
      };
    });
}
