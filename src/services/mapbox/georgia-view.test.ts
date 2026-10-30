import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GEORGIA_BBOX, GEORGIA_FIT_BOUNDS, GEORGIA_CENTER } from "./georgiaBoundary";
import { MAX_PITCH, MIN_ZOOM, VIEW_3D_PITCH } from "./mapTuning";

const SRC = join(process.cwd(), "src");
const mapService = readFileSync(join(SRC, "services/mapbox/mapService.ts"), "utf8");
const atlasMap = readFileSync(join(SRC, "components/map/atlas-map.tsx"), "utf8");

describe("the initial map view clearly shows Georgia without locking the camera", () => {
  test("the fit bounds are exactly Georgia's own bounding box", () => {
    assert.deepEqual(GEORGIA_FIT_BOUNDS, [
      [GEORGIA_BBOX.west, GEORGIA_BBOX.south],
      [GEORGIA_BBOX.east, GEORGIA_BBOX.north],
    ]);
    // Georgia sits roughly at 40-47E, 41-44N.
    const [[west, south], [east, north]] = GEORGIA_FIT_BOUNDS;
    assert.ok(west > 39 && east < 48 && south > 40 && north < 45);
    assert.ok(GEORGIA_CENTER[0] > west && GEORGIA_CENTER[0] < east && GEORGIA_CENTER[1] > south && GEORGIA_CENTER[1] < north);
  });

  test("the map is NOT hard-locked: no maxBounds option is passed to Mapbox", () => {
    assert.doesNotMatch(mapService, /maxBounds\s*:/);
    assert.doesNotMatch(mapService, /setMaxBounds/);
  });

  test("the first camera is framed on the real shape for the container size (not a fixed zoom), defaulting to Georgia's outline", () => {
    assert.match(mapService, /this\.frame\(map, this\.framing, map\.getPitch\(\)\)/);
    assert.match(mapService, /targetFits/);
    assert.match(mapService, /GEORGIA_BOUNDARY\.geometry\.coordinates\[0\]/);
    assert.match(mapService, /this\.framing = focusBounds \? "focus" : "georgia"/);
  });

  test("re-fits on resize only until the guest moves the map themselves (the map never fights a manual move)", () => {
    assert.match(mapService, /keepFramedUntilUserMoves/);
    assert.match(mapService, /originalEvent/);
  });

  test("a stable tilted 3D view with a flat 2D fallback: moderate pitch, soft pitch ceiling, north-up", () => {
    assert.ok(VIEW_3D_PITCH > 20 && VIEW_3D_PITCH <= 60);
    assert.ok(MAX_PITCH >= VIEW_3D_PITCH && MAX_PITCH <= 70);
    assert.match(mapService, /bearing: 0/);
    assert.match(mapService, /setViewMode\(mode: MapViewMode\)/);
    // Low-power devices and reduced-motion users start flat.
    assert.match(mapService, /performance\.profile === "low" \|\| reducedMotion \? "2d" : "3d"/);
  });

  test("the zoom-out limit is low enough that Georgia can be framed on a narrow phone", () => {
    assert.ok(MIN_ZOOM <= 4.5);
  });
});

describe("a page can focus the camera on a small area while the Georgia overview stays one tap away", () => {
  test("showFraming flips between the focus area and Georgia, and an explicit choice re-enables re-fitting on resize", () => {
    assert.match(mapService, /showFraming\(target: FramingTarget\)/);
    assert.match(mapService, /this\.userMoved = false/);
    assert.match(mapService, /hasFocusArea\(\)/);
  });

  test("a focus area is framed from its own corners (so the route and markers are inside the frame), never closer than the max focus zoom", () => {
    assert.match(mapService, /\[west, south\],\s*\[west, north\],\s*\[east, south\],\s*\[east, north\]/);
    assert.match(mapService, /MAX_FOCUS_ZOOM/);
  });

  test("the 2D/3D toggle is kept alongside the framing toggle", () => {
    assert.match(atlasMap, /addViewModeControl/);
    assert.match(atlasMap, /addFramingControl/);
    assert.match(atlasMap, /service\.hasFocusArea\(\)/);
  });
});

describe("isolated preview mode never leaks into real guest pages", () => {
  test("an isolated preview does not request location, fly to the guest, or swap in eligible places", () => {
    assert.match(atlasMap, /if \(isolatedPreviewRef\.current\) return;/);
    assert.match(atlasMap, /if \(!isolatedPreviewRef\.current\) \{\s*locationService\.start\(\);/);
  });

  test("the real guest map section does not use it", () => {
    const section = readFileSync(join(SRC, "app/(app)/advisor-map-section.tsx"), "utf8");
    // anchorMarker is allowed here since the route preview: it is the guest's own hotel marker (origin and return).
    assert.doesNotMatch(section, /isolatedPreview|focusBounds/);
  });
});
