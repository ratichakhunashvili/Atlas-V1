import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/**
 * Guests see 3D models on the real map. The renderer (components/map3d/models-layer.ts) and the server's choice of
 * models (services/map3d listGuestPlaceModels) are tested on their own; this guards the wiring between them, which
 * once existed only on the development preview map.
 */

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("3D models on the guest map", () => {
  it("the home page gets the models from the server's own per-guest list, never from the request", () => {
    const page = read("src/app/(guest)/(map)/page.tsx");
    assert.match(page, /listGuestPlaceModels\(user\.id\)/);
    assert.match(page, /models=\{models\}/);
  });

  it("the home map hands those models to the shared map scene", () => {
    assert.match(read("src/components/atlas-ui/map/live-missions-map.tsx"), /^\s+models,\n\s+\},\n\s+selectPlace/m);
  });

  it("the shared map draws them with the one models layer, loaded only when there is a model", () => {
    const map = read("src/components/atlas-ui/map/atlas-map.tsx");
    assert.match(map, /import\("@\/components\/map3d\/models-layer"\)/);
    assert.match(map, /if \(list\.length === 0\) return;/);
    assert.match(map, /layer\.pick\(/);
    assert.equal(/from "@\/components\/map3d\/models-layer"/.test(map.replace(/import type[^;]+;/g, "")), false, "Three.js must stay lazily loaded");
  });
});
