import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/** Picking a place in the list (or its marker) flies the one map there and shows its details in the sheet. */

type Call = { kind: "fly" | "jump" | "ease"; center?: [number, number]; zoom?: number; offset?: [number, number]; bearing?: number };

function fakeMap(zoom: number, pitch = 0) {
  const calls: Call[] = [];
  const map = {
    getZoom: () => zoom,
    getPitch: () => pitch,
    getLayer: () => undefined,
    flyTo: (o: Call) => calls.push({ kind: "fly", center: o.center, zoom: o.zoom, offset: o.offset, ...(o.bearing === undefined ? {} : { bearing: o.bearing }) }),
    jumpTo: (o: Call) => calls.push({ kind: "jump", center: o.center, zoom: o.zoom, offset: o.offset }),
    easeTo: () => calls.push({ kind: "ease" }),
  };
  return { map, calls };
}

describe("the camera on a chosen place", () => {
  it("flies to the place, close in", async () => {
    const { applyCamera } = await import("./engine");
    const { map, calls } = fakeMap(13);
    applyCamera(map as never, "place", false, [45.7, 41.7], undefined, [45.71, 41.74], 396);
    // Lifted by half the sheet, so the place lands in the visible map above the sheet.
    assert.deepEqual(calls, [{ kind: "fly", center: [45.71, 41.74], zoom: 16, offset: [0, -198] }]);
  });

  it("keeps a closer zoom, jumps with reduced motion, and ignores a request without a place", async () => {
    const { applyCamera } = await import("./engine");
    const { map, calls } = fakeMap(18);
    applyCamera(map as never, "place", true, undefined, undefined, [45.71, 41.74]);
    applyCamera(map as never, "place", true);
    assert.deepEqual(calls, [{ kind: "jump", center: [45.71, 41.74], zoom: 18, offset: [0, 0] }]);
  });

  it("turns a rotated map back to north for the hotel and the guest, but not for a picked place", async () => {
    const { applyCamera } = await import("./engine");
    const { map, calls } = fakeMap(15);
    applyCamera(map as never, "hotel", false, [45.7, 41.7]);
    applyCamera(map as never, "you", false, [45.7, 41.7], [45.71, 41.71]);
    applyCamera(map as never, "place", false, undefined, undefined, [45.72, 41.72]);
    assert.deepEqual(calls.map((call) => call.bearing), [0, 0, undefined]);
  });

  it("isn't interrupted by re-applying the tilt the map already has", async () => {
    const { applyDimension } = await import("./engine");
    const tilted = fakeMap(16, 0);
    applyDimension(tilted.map as never, false, false);
    assert.deepEqual(tilted.calls, [], "no easeTo, which would cancel a flight in progress");
    applyDimension(tilted.map as never, true, false);
    assert.deepEqual(tilted.calls, [{ kind: "ease" }]);
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
