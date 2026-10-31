import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import {
  LARGE_SEPARATION_METERS,
  anchorSeparationMeters,
  isInsideSupportedRegion,
  resolveDisplayAnchor,
  validateAnchor,
} from "./placement";
import { buildAnchorMatrix, lngLatToMercator } from "./anchor";

const PLACE = { latitude: 41.7151, longitude: 44.8271 };

function offsetNorth(meters: number) {
  return { anchorLatitude: PLACE.latitude + (meters / 6371000) * (180 / Math.PI), anchorLongitude: PLACE.longitude };
}

describe("the display anchor is independent of the Place", () => {
  it("is the Place's own location until an anchor is set, so existing models do not move", () => {
    const anchor = resolveDisplayAnchor({ anchorLatitude: null, anchorLongitude: null }, PLACE);
    assert.deepEqual(anchor, { latitude: PLACE.latitude, longitude: PLACE.longitude, independent: false });
  });

  it("is the stored anchor when set, leaving the Place's coordinates exactly as they were", () => {
    const place = { ...PLACE };
    const anchor = resolveDisplayAnchor({ anchorLatitude: 41.72, anchorLongitude: 44.83 }, place);
    assert.deepEqual(anchor, { latitude: 41.72, longitude: 44.83, independent: true });
    assert.deepEqual(place, PLACE, "resolving an anchor never touches the Place");
  });

  it("treats a half-set anchor as not set rather than guessing", () => {
    assert.equal(resolveDisplayAnchor({ anchorLatitude: 41.72, anchorLongitude: null }, PLACE).independent, false);
    assert.equal(resolveDisplayAnchor({ anchorLatitude: null, anchorLongitude: 44.8 }, PLACE).independent, false);
  });

  it("measures how far the drawn model is from the real location", () => {
    assert.equal(Math.round(anchorSeparationMeters({ anchorLatitude: null, anchorLongitude: null }, PLACE)), 0);
    assert.ok(Math.abs(anchorSeparationMeters(offsetNorth(100), PLACE) - 100) < 1);
  });

  it("places the object by its ANCHOR's geographic position, not the Place's", () => {
    const anchorPoint = { lat: 41.72, lng: 44.83 };
    const matrix = buildAnchorMatrix(anchorPoint.lng, anchorPoint.lat);
    const origin = new THREE.Vector3(0, 0, 0).applyMatrix4(matrix);
    const expected = lngLatToMercator(anchorPoint.lng, anchorPoint.lat);
    assert.ok(Math.abs(origin.x - expected.x) < 1e-12 && Math.abs(origin.y - expected.y) < 1e-12);

    const atPlace = new THREE.Vector3(0, 0, 0).applyMatrix4(buildAnchorMatrix(PLACE.longitude, PLACE.latitude));
    assert.ok(Math.abs(origin.x - atPlace.x) > 1e-7, "moving the anchor moves where the model is drawn");
  });
});

describe("validating an anchor", () => {
  const base = { place: PLACE, confirmedLargeSeparation: false };

  it("accepts no anchor, and an anchor near the Place", () => {
    assert.deepEqual(validateAnchor({ ...base, anchorLatitude: null, anchorLongitude: null }), { ok: true });
    assert.deepEqual(validateAnchor({ ...base, ...offsetNorth(50) }), { ok: true });
  });

  it("requires both coordinates or neither", () => {
    assert.equal(validateAnchor({ ...base, anchorLatitude: 41.7, anchorLongitude: null }).ok, false);
    assert.equal(validateAnchor({ ...base, anchorLatitude: null, anchorLongitude: 44.8 }).ok, false);
  });

  it("keeps the anchor inside the supported region", () => {
    assert.equal(isInsideSupportedRegion(41.7, 44.8), true);
    for (const [lat, lng] of [[0, 0], [48.85, 2.35], [41.7, 60], [Number.NaN, 44.8]]) {
      assert.equal(isInsideSupportedRegion(lat, lng), false, `${lat},${lng}`);
      assert.equal(validateAnchor({ ...base, anchorLatitude: lat, anchorLongitude: lng }).ok, false);
    }
  });

  it("demands explicit confirmation for an unusually large separation, and accepts it once confirmed", () => {
    const far = offsetNorth(LARGE_SEPARATION_METERS + 100);
    const refused = validateAnchor({ ...base, ...far });
    assert.equal(refused.ok, false);
    assert.equal(validateAnchor({ ...base, ...far, confirmedLargeSeparation: true }).ok, true);
    assert.equal(validateAnchor({ ...base, ...offsetNorth(LARGE_SEPARATION_METERS - 10) }).ok, true, "just inside the limit needs no confirmation");
  });
});

describe("transform conventions", () => {
  it("applies pitch, roll and per-axis scale, and leaves the defaults identical to the old behaviour", () => {
    const plain = buildAnchorMatrix(44.8, 41.7, { rotationDegrees: 30, scale: 2 });
    const explicitDefaults = buildAnchorMatrix(44.8, 41.7, {
      rotationDegrees: 30,
      scale: 2,
      pitchDegrees: 0,
      rollDegrees: 0,
      axisScale: { x: 1, y: 1, z: 1 },
    });
    assert.deepEqual(plain.toArray(), explicitDefaults.toArray());

    const pitched = buildAnchorMatrix(44.8, 41.7, { pitchDegrees: 45 });
    const flat = buildAnchorMatrix(44.8, 41.7, {});
    assert.notDeepEqual(pitched.toArray(), flat.toArray());
  });

  it("per-axis scale stretches along the model's own axes", () => {
    const base = buildAnchorMatrix(44.8, 41.7, {});
    const stretched = buildAnchorMatrix(44.8, 41.7, { axisScale: { x: 2 } });
    const unit = new THREE.Vector3(1, 0, 0);
    const a = unit.clone().applyMatrix4(base).sub(new THREE.Vector3(0, 0, 0).applyMatrix4(base)).length();
    const b = unit.clone().applyMatrix4(stretched).sub(new THREE.Vector3(0, 0, 0).applyMatrix4(stretched)).length();
    assert.ok(Math.abs(b / a - 2) < 1e-9);
  });
});
