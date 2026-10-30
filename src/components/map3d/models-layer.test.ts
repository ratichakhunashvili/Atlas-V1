import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { findPlaceId } from "./models-layer";

/**
 * The parts of the 3D layer that can be checked without a browser.
 *
 * `PlaceModelsLayer` itself needs a WebGL context and a live Mapbox map, so it is
 * **not** exercised here — its behaviour on a real device is unverified and
 * reported as such. What IS checked: the hit-to-Place resolution that picking
 * depends on, and the structural rules that keep one scene, one renderer and one
 * context, which a later edit could quietly break.
 */

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const stripComments = (source: string) =>
  source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const LAYER = "src/components/map3d/models-layer.ts";

describe("resolving a ray hit back to its Place", () => {
  it("finds the id on the mesh that was hit", () => {
    const mesh = new THREE.Mesh();
    mesh.userData.placeId = "place-1";

    assert.equal(findPlaceId(mesh), "place-1");
  });

  it("walks up to the ancestor that carries it", () => {
    const group = new THREE.Group();
    group.userData.placeId = "place-2";

    const child = new THREE.Group();
    const mesh = new THREE.Mesh();
    child.add(mesh);
    group.add(child);

    assert.equal(findPlaceId(mesh), "place-2", "a hit on a nested mesh still resolves to its Place");
  });

  it("returns the NEAREST ancestor's id when models are nested", () => {
    const outer = new THREE.Group();
    outer.userData.placeId = "outer-place";

    const inner = new THREE.Group();
    inner.userData.placeId = "inner-place";
    outer.add(inner);

    const mesh = new THREE.Mesh();
    inner.add(mesh);

    assert.equal(findPlaceId(mesh), "inner-place", "the object actually hit wins");
  });

  it("returns null for scenery that belongs to no Place", () => {
    const light = new THREE.AmbientLight();
    assert.equal(findPlaceId(light), null, "a hit on nothing must not select a Place");
    assert.equal(findPlaceId(null), null);
  });
});

describe("one scene, one renderer, one context", () => {
  const source = stripComments(read(LAYER));

  it("creates exactly one renderer and one scene for all models", () => {
    assert.equal((source.match(/new THREE\.WebGLRenderer/g) ?? []).length, 1);
    assert.equal((source.match(/new THREE\.Scene\(\)/g) ?? []).length, 1);
  });

  it("shares Mapbox's WebGL context rather than creating a second one", () => {
    assert.match(source, /context: gl/, "a second context would compete for the browser's limited supply");
    assert.match(source, /canvas: map\.getCanvas\(\)/);
  });

  it("never clears the canvas Mapbox owns", () => {
    assert.match(source, /autoClear = false/);
  });

  it("does not dispose the shared renderer on teardown", () => {
    // Disposing it would take the map's own rendering down with it.
    assert.doesNotMatch(source, /renderer\.dispose\(\)/);
  });

  it("frees per-model GPU resources when a model goes", () => {
    assert.match(source, /geometry\?\.dispose\?\.\(\)/);
    assert.match(source, /material\.dispose\?\.\(\)/);
  });

  it("never disposes the shared locked material", () => {
    assert.match(source, /material !== LOCKED_MATERIAL/, "disposing it would blank every other locked model");
  });
});

describe("placement comes from geography, not the screen", () => {
  const source = stripComments(read(LAYER));

  it("builds each model's matrix from its geographic display anchor, never the screen", () => {
    assert.match(source, /buildAnchorMatrix\(model\.anchorLongitude, model\.anchorLatitude/);
    assert.doesNotMatch(source, /model\.longitude|model\.latitude/, "the canonical Place coordinates are not used to draw");
    assert.match(source, /matrixAutoUpdate = false/, "the anchor matrix is authoritative");
  });

  it("takes the frame's camera matrix from Mapbox", () => {
    assert.match(source, /projectionMatrix = new THREE\.Matrix4\(\)\.fromArray\(matrix\)/);
  });

  it("picks by raycasting, never by nearest marker", () => {
    assert.match(source, /raycaster\.setFromCamera/);
    assert.match(source, /intersectObjects/);
    assert.doesNotMatch(source, /nearest|closestMarker|distanceTo\(/i);
  });
});

describe("failure and performance behaviour", () => {
  const source = stripComments(read(LAYER));

  it("survives a model that will not load, leaving the map usable", () => {
    assert.match(source, /catch \{/, "a failed load is caught per model");
  });

  it("does not cache a failed load as permanently broken", () => {
    assert.match(source, /loading\.catch\(\(\) => this\.cache\.delete\(url\)\)/);
  });

  it("caches each file once and clones per placement", () => {
    assert.match(source, /this\.cache\.get\(url\)/);
    assert.match(source, /source\.clone\(true\)/);
  });

  it("skips drawing entirely when zoomed out or disabled", () => {
    assert.match(source, /getZoom\(\) < MIN_MODEL_ZOOM/);
    assert.match(source, /options\.enabled === false/);
  });
});

describe("no idle repaint loop, and selective loading", () => {
  const source = stripComments(read(LAYER));

  it("never requests another frame from inside render()", () => {
    const render = source.slice(source.indexOf("render(_gl"), source.indexOf("async setModels"));
    assert.doesNotMatch(render, /triggerRepaint/, "a repaint from render() is a loop that never idles");
  });

  it("requests a repaint only when the models actually changed", () => {
    assert.match(source, /if \(changed\) this\.map\?\.triggerRepaint\(\)/);
  });

  it("loads models near the screen only, re-evaluated when the camera settles", () => {
    assert.match(source, /map\.on\("moveend", this\.handleMoveEnd\)/);
    assert.match(source, /this\.map\?\.off\("moveend", this\.handleMoveEnd\)/);
    assert.match(source, /modelsToKeep\(\)/);
  });

  it("applies a placement-only change in place instead of rebuilding the model", () => {
    assert.match(source, /existing\.transformKey !== transformKey/);
    assert.match(source, /existing\.group\.matrix = matrixFor\(model\)/);
  });
});
