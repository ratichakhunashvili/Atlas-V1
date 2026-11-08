import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/** Picking a place in the list (or its marker) flies the one map there and shows its details in the sheet. */

type Call = { kind: "fly" | "jump"; center: [number, number]; zoom: number };

function fakeMap(zoom: number) {
  const calls: Call[] = [];
  const map = {
    getZoom: () => zoom,
    flyTo: (options: { center: [number, number]; zoom: number }) => calls.push({ kind: "fly", center: options.center, zoom: options.zoom }),
    jumpTo: (options: { center: [number, number]; zoom: number }) => calls.push({ kind: "jump", center: options.center, zoom: options.zoom }),
  };
  return { map, calls };
}

describe("the camera on a chosen place", () => {
  it("flies to the place, close in", async () => {
    const { applyCamera } = await import("./engine");
    const { map, calls } = fakeMap(13);
    applyCamera(map as never, "place", false, [45.7, 41.7], undefined, [45.71, 41.74]);
    assert.deepEqual(calls, [{ kind: "fly", center: [45.71, 41.74], zoom: 16 }]);
  });

  it("keeps a closer zoom, jumps with reduced motion, and ignores a request without a place", async () => {
    const { applyCamera } = await import("./engine");
    const { map, calls } = fakeMap(18);
    applyCamera(map as never, "place", true, undefined, undefined, [45.71, 41.74]);
    applyCamera(map as never, "place", true);
    assert.deepEqual(calls, [{ kind: "jump", center: [45.71, 41.74], zoom: 18 }]);
  });
});

describe("the map's place cards", () => {
  const screen = readFileSync("src/components/atlas-ui/map/live-missions-map.tsx", "utf8");
  it("open the place on the map and in the sheet instead of leaving the map", () => {
    assert.match(screen, /onClick=\{\(\) => onOpen\(place\.id\)\}/);
    assert.match(screen, /moveCamera\("place", place\.at\)/);
    assert.match(screen, /<LivePlaceDetails place=\{open\}/);
  });
});
