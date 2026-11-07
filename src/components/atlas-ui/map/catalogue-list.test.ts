import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { distanceMeters } from "@/lib/geo";

/** The map's list holds every eligible Place within 15 km of the hotel, and zooming or panning never drops any. */

const page = readFileSync("src/app/(guest)/(map)/page.tsx", "utf8");
const screen = readFileSync("src/components/atlas-ui/map/live-missions-map.tsx", "utf8");

describe("the map's place list", () => {
  it("loads the catalogue within 15 km of the hotel", () => {
    assert.match(page, /CATALOGUE_RADIUS_METERS = 15_000/);
    assert.match(page, /radiusMeters: CATALOGUE_RADIUS_METERS/);
  });

  it("uses a box that fully contains the 15 km circle in Georgia", () => {
    const halfSpan = Number(/CATALOGUE_HALF_SPAN_DEGREES = ([\d.]+)/.exec(page)?.[1]);
    // Georgia's northernmost latitude, where a degree of longitude is shortest.
    const at = { lat: 43.6, lng: 44 };
    assert.ok(distanceMeters(at, { lat: at.lat + halfSpan, lng: at.lng }) > 15_000);
    assert.ok(distanceMeters(at, { lat: at.lat, lng: at.lng + halfSpan }) > 15_000);
  });

  it("never reloads (and so never empties) the list when the map moves", () => {
    assert.doesNotMatch(screen, /useMapViewport|\/api\/places\/viewport|setPlaces/);
  });
});
