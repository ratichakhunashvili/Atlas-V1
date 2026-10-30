import { SUPPORTED_MODEL_REGION } from "@/db/schema/place-models";
import { distanceMeters } from "@/lib/geo";

/**
 * Display placement of a 3D model, as pure rules.
 *
 * The one idea: a model's DISPLAY anchor and its Place's CANONICAL location are two different things. The anchor
 * decides where the model is drawn. The Place's own coordinates decide everything else — eligibility, distance,
 * the route destination, check-in, the achievement and the pin. Nothing in this file (or anything that uses it) may
 * write to a Place, and nothing about a Place is derived from an anchor.
 */

/** Beyond this the model is drawn far enough from the real location that an admin must say they meant it. */
export const LARGE_SEPARATION_METERS = 250;

export type PlaceLocation = { latitude: number; longitude: number };
export type AnchorFields = { anchorLatitude: number | null; anchorLongitude: number | null };

export function isInsideSupportedRegion(latitude: number, longitude: number): boolean {
  const region = SUPPORTED_MODEL_REGION;
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= region.minLat &&
    latitude <= region.maxLat &&
    longitude >= region.minLng &&
    longitude <= region.maxLng
  );
}

/**
 * Where to DRAW the model. With no stored anchor (every model created before anchors existed) it is the Place's own
 * location, so existing models do not move. A half-set anchor (one coordinate only) is treated as not set: the
 * database forbids it, but a renderer that guessed would draw a model somewhere nobody chose.
 */
export function resolveDisplayAnchor(model: AnchorFields, place: PlaceLocation): PlaceLocation & { independent: boolean } {
  if (model.anchorLatitude !== null && model.anchorLongitude !== null) {
    return { latitude: model.anchorLatitude, longitude: model.anchorLongitude, independent: true };
  }
  return { latitude: place.latitude, longitude: place.longitude, independent: false };
}

/** How far the drawn model sits from the real Place, in metres. */
export function anchorSeparationMeters(model: AnchorFields, place: PlaceLocation): number {
  const anchor = resolveDisplayAnchor(model, place);
  return distanceMeters(
    { lat: place.latitude, lng: place.longitude },
    { lat: anchor.latitude, lng: anchor.longitude }
  );
}

export function requiresSeparationConfirmation(separationMeters: number): boolean {
  return separationMeters > LARGE_SEPARATION_METERS;
}

export type AnchorValidation = { ok: true } | { ok: false; message: string };

/**
 * Whether a posted anchor may be saved. Pure so the admin action and the tests apply the same rules:
 * both coordinates or neither, inside the supported region, and — when far from the Place — only with explicit
 * confirmation.
 */
export function validateAnchor(input: {
  anchorLatitude: number | null;
  anchorLongitude: number | null;
  place: PlaceLocation;
  confirmedLargeSeparation: boolean;
}): AnchorValidation {
  const { anchorLatitude, anchorLongitude } = input;

  if (anchorLatitude === null && anchorLongitude === null) return { ok: true };
  if (anchorLatitude === null || anchorLongitude === null) {
    return { ok: false, message: "Enter both the anchor's latitude and longitude, or clear both to place it at the Place." };
  }
  if (!isInsideSupportedRegion(anchorLatitude, anchorLongitude)) {
    return { ok: false, message: "That anchor is outside the area Atlas supports (Georgia). Move it back onto the map of Georgia." };
  }

  const separation = anchorSeparationMeters({ anchorLatitude, anchorLongitude }, input.place);
  if (requiresSeparationConfirmation(separation) && !input.confirmedLargeSeparation) {
    return {
      ok: false,
      message: `The model would be drawn about ${Math.round(separation)} m from the real location. Tick the confirmation to save it that far away.`,
    };
  }

  return { ok: true };
}
