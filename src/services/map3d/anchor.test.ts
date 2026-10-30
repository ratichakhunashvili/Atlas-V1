import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import {
  buildAnchorMatrix,
  groundingOffset,
  lngLatToMercator,
  meterInMercatorUnits,
  scaleToTargetHeight,
} from "./anchor";

/**
 * The geographic maths, checked by arithmetic rather than by looking at a screen.
 *
 * These are the failures this catches: a model that drifts as the camera moves, a
 * model the wrong size at Georgia's latitude, a model mirrored by a Y flip applied
 * in the wrong order, or one buried to its waist in the ground.
 */

/** Central Tbilisi, where Atlas's first Places are. */
const TBILISI = { lng: 44.8271, lat: 41.7151 };

describe("Mercator projection", () => {
  it("puts the origin of the unit square at the antimeridian and the north pole edge", () => {
    const origin = lngLatToMercator(-180, 85.051129);

    assert.ok(Math.abs(origin.x - 0) < 1e-9, "longitude -180 is x = 0");
    assert.ok(Math.abs(origin.y - 0) < 1e-6, "the Mercator top edge is y = 0");
  });

  it("puts the equator at the vertical centre and Greenwich at the horizontal centre", () => {
    const nullIsland = lngLatToMercator(0, 0);

    assert.ok(Math.abs(nullIsland.x - 0.5) < 1e-12);
    assert.ok(Math.abs(nullIsland.y - 0.5) < 1e-12);
  });

  it("increases x eastward and y SOUTHWARD, which is why the matrix flips Y", () => {
    const here = lngLatToMercator(TBILISI.lng, TBILISI.lat);
    const east = lngLatToMercator(TBILISI.lng + 0.01, TBILISI.lat);
    const south = lngLatToMercator(TBILISI.lng, TBILISI.lat - 0.01);

    assert.ok(east.x > here.x, "east is +x");
    assert.ok(south.y > here.y, "south is +y in Mercator");
  });

  it("converts altitude into Mercator units using the local scale", () => {
    const ground = lngLatToMercator(TBILISI.lng, TBILISI.lat, 0);
    const up = lngLatToMercator(TBILISI.lng, TBILISI.lat, 100);

    assert.equal(ground.z, 0);
    assert.ok(Math.abs(up.z - 100 * meterInMercatorUnits(TBILISI.lat)) < 1e-15);
  });
});

describe("metres per Mercator unit", () => {
  it("shrinks with latitude: a metre is a bigger fraction of the square further north", () => {
    const equator = meterInMercatorUnits(0);
    const tbilisi = meterInMercatorUnits(TBILISI.lat);

    assert.ok(tbilisi > equator, "ignoring this is what makes models the wrong size in Georgia");
  });

  it("is symmetric across the equator", () => {
    assert.ok(Math.abs(meterInMercatorUnits(41.7151) - meterInMercatorUnits(-41.7151)) < 1e-18);
  });

  it("matches the known circumference at the equator", () => {
    // One metre as a fraction of the 40,075,016.686 m equator.
    assert.ok(Math.abs(meterInMercatorUnits(0) - 1 / 40_075_016.686) < 1e-18);
  });
});

describe("the anchor matrix", () => {
  /** Where the matrix puts the model's own origin. */
  function originOf(matrix: THREE.Matrix4): THREE.Vector3 {
    return new THREE.Vector3(0, 0, 0).applyMatrix4(matrix);
  }

  /** Where a point one model-unit along an axis ends up, relative to the origin. */
  function axisDirection(matrix: THREE.Matrix4, axis: "x" | "y" | "z"): THREE.Vector3 {
    const unit = new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0);
    return unit.applyMatrix4(matrix).sub(originOf(matrix));
  }

  it("places the model origin at the Place's own coordinates", () => {
    const matrix = buildAnchorMatrix(TBILISI.lng, TBILISI.lat);
    const expected = lngLatToMercator(TBILISI.lng, TBILISI.lat);
    const origin = originOf(matrix);

    assert.ok(Math.abs(origin.x - expected.x) < 1e-12);
    assert.ok(Math.abs(origin.y - expected.y) < 1e-12);
  });

  it("points model +X east", () => {
    const direction = axisDirection(buildAnchorMatrix(TBILISI.lng, TBILISI.lat), "x");

    assert.ok(direction.x > 0, "+X must increase Mercator x, which is east");
    assert.ok(Math.abs(direction.y) < 1e-15, "and must not drift north or south");
  });

  it("points model +Y UP, not south — the flip the convention exists for", () => {
    const direction = axisDirection(buildAnchorMatrix(TBILISI.lng, TBILISI.lat), "y");

    // Mercator y grows southward, so "up" must come out NEGATIVE in y.
    assert.ok(direction.y < 0, "+Y must oppose Mercator's southward y");
    assert.ok(Math.abs(direction.x) < 1e-15);
  });

  it("points model +Z south", () => {
    const direction = axisDirection(buildAnchorMatrix(TBILISI.lng, TBILISI.lat), "z");

    assert.ok(direction.z > 0, "+Z is south in the z component of Mercator space");
  });

  /*
   * Axis directions are measured by transforming a unit vector and subtracting the
   * origin — and the origin is ~0.62 in Mercator units while a metre is ~3e-8, so
   * that subtraction loses precision to cancellation (absolute error around 1e-16,
   * far larger than the quantity itself is precise to). Comparing these as RELATIVE
   * error is therefore the honest test; an absolute epsilon here would be measuring
   * float64 rather than the maths.
   */
  function assertCloseRelative(actual: number, expected: number, tolerance = 1e-6) {
    assert.ok(
      Math.abs(actual - expected) / Math.abs(expected) < tolerance,
      `expected ~${expected}, got ${actual}`
    );
  }

  it("scales a metre correctly for the latitude it is placed at", () => {
    const matrix = buildAnchorMatrix(TBILISI.lng, TBILISI.lat);
    const oneUnitEast = axisDirection(matrix, "x");

    assertCloseRelative(oneUnitEast.x, meterInMercatorUnits(TBILISI.lat));
  });

  it("applies an admin's scale on top of the metre conversion", () => {
    const plain = axisDirection(buildAnchorMatrix(TBILISI.lng, TBILISI.lat), "x");
    const doubled = axisDirection(buildAnchorMatrix(TBILISI.lng, TBILISI.lat, { scale: 2 }), "x");

    assertCloseRelative(doubled.x, plain.x * 2);
  });

  it("rotates about the vertical axis without moving the anchor", () => {
    const straight = buildAnchorMatrix(TBILISI.lng, TBILISI.lat);
    const turned = buildAnchorMatrix(TBILISI.lng, TBILISI.lat, { rotationDegrees: 90 });

    const straightOrigin = originOf(straight);
    const turnedOrigin = originOf(turned);

    assert.ok(Math.abs(straightOrigin.x - turnedOrigin.x) < 1e-15, "rotation must not move the model");
    assert.ok(Math.abs(straightOrigin.y - turnedOrigin.y) < 1e-15);

    // A quarter turn sends model +X to model -Z (or +Z, depending on handedness) —
    // either way it must leave the east axis.
    const turnedX = axisDirection(turned, "x");
    assert.ok(Math.abs(turnedX.x) < 1e-15, "after 90 degrees, +X no longer points east");
    assert.ok(Math.abs(turnedX.z) > 0);
  });

  it("lifts the model by the elevation offset, in metres", () => {
    const ground = originOf(buildAnchorMatrix(TBILISI.lng, TBILISI.lat));
    const raised = originOf(buildAnchorMatrix(TBILISI.lng, TBILISI.lat, { elevationOffsetMeters: 50 }));

    const expectedLift = 50 * meterInMercatorUnits(TBILISI.lat);
    assert.ok(Math.abs(raised.z - ground.z - expectedLift) < 1e-15);
  });

  it("is stable: the same Place always produces the same matrix", () => {
    const first = buildAnchorMatrix(TBILISI.lng, TBILISI.lat, { rotationDegrees: 30, scale: 1.5 });
    const second = buildAnchorMatrix(TBILISI.lng, TBILISI.lat, { rotationDegrees: 30, scale: 1.5 });

    assert.deepEqual(first.elements, second.elements, "no camera state may leak into placement");
  });

  it("places two different Places at two different points", () => {
    const here = originOf(buildAnchorMatrix(TBILISI.lng, TBILISI.lat));
    const elsewhere = originOf(buildAnchorMatrix(TBILISI.lng + 0.05, TBILISI.lat + 0.05));

    assert.ok(Math.abs(here.x - elsewhere.x) > 1e-6);
    assert.ok(Math.abs(here.y - elsewhere.y) > 1e-6);
  });
});

describe("normalising a model's size", () => {
  it("scales a model to the height an admin asked for", () => {
    // A 2-unit-tall model that should stand 40 m.
    assert.equal(scaleToTargetHeight(2, 40), 20);
  });

  it("copes with the exporter scales that make this necessary", () => {
    assert.equal(scaleToTargetHeight(200, 40), 0.2, "a centimetre-scale export");
    assert.equal(scaleToTargetHeight(0.5, 10), 20, "a tiny export");
  });

  it("falls back to 1 rather than producing a degenerate scale", () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      assert.equal(scaleToTargetHeight(bad, 40), 1, `height ${bad} must not break placement`);
      assert.equal(scaleToTargetHeight(2, bad), 1, `target ${bad} must not break placement`);
    }
  });
});

describe("grounding", () => {
  it("lifts a centred model by half its scaled height so its base meets the ground", () => {
    assert.equal(groundingOffset(2, 20), 20, "a 40 m model sits 20 m above its centre");
  });

  it("returns zero for nonsense rather than flinging the model into orbit", () => {
    assert.equal(groundingOffset(NaN, 2), 0);
    assert.equal(groundingOffset(2, Infinity), 0);
  });
});
