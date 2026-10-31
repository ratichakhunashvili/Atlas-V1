import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GEORGIA_BBOX } from "@/services/mapbox/georgiaBoundary";
import {
  DEMO_DISCLAIMER,
  DEMO_HOTEL,
  DEMO_STOPS,
  DEMO_TRIP_BOUNDS,
  formatDistance,
  formatDuration,
  tripBounds,
} from "./sample-trip";

const SRC = join(process.cwd(), "src");
const page = readFileSync(join(SRC, "app/map-preview/page.tsx"), "utf8");
/** The page source with comments removed, so a code comment that merely mentions a word cannot trip a "does not use X" check. */
const pageCode = page.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("the sample itinerary is isolated, clearly labelled demo data", () => {
  test("it is hotel -> stop 1 -> stop 2 -> stop 3, in that order, with three numbered stops", () => {
    assert.equal(DEMO_STOPS.length, 3);
    assert.deepEqual(
      DEMO_STOPS.map((s) => s.name),
      ["Demo Stop 1 (sample location)", "Demo Stop 2 (sample location)", "Demo Stop 3 (sample location)"]
    );
  });

  test("every point is labelled as a demo/sample, so none can be mistaken for a real business or partner", () => {
    for (const point of [DEMO_HOTEL, ...DEMO_STOPS]) assert.match(point.name, /demo/i, point.name);
    assert.match(DEMO_HOTEL.name, /not a real hotel/i);
    assert.match(DEMO_DISCLAIMER, /not real businesses and not hotel partners/i);
  });

  test("ids are fixed UUIDs, unique, and unrelated to any seed or fixture used by the product", () => {
    const ids = [DEMO_HOTEL, ...DEMO_STOPS].map((p) => p.id);
    for (const id of ids) assert.match(id, UUID);
    assert.equal(new Set(ids).size, ids.length);
  });

  test("all points are inside Georgia, in central Tbilisi, with valid coordinates", () => {
    for (const p of [DEMO_HOTEL, ...DEMO_STOPS]) {
      assert.ok(p.latitude >= -90 && p.latitude <= 90 && p.longitude >= -180 && p.longitude <= 180);
      assert.ok(p.longitude > GEORGIA_BBOX.west && p.longitude < GEORGIA_BBOX.east, p.name);
      assert.ok(p.latitude > GEORGIA_BBOX.south && p.latitude < GEORGIA_BBOX.north, p.name);
      assert.ok(p.latitude > 41.6 && p.latitude < 41.8 && p.longitude > 44.7 && p.longitude < 44.9, `${p.name} is in central Tbilisi`);
    }
  });
});

describe("tripBounds frames the whole trip", () => {
  test("the box contains the hotel and every stop", () => {
    const [[west, south], [east, north]] = DEMO_TRIP_BOUNDS;
    for (const p of [DEMO_HOTEL, ...DEMO_STOPS]) {
      assert.ok(p.longitude >= west && p.longitude <= east && p.latitude >= south && p.latitude <= north, p.name);
    }
  });

  test("it is the tight box (min/max of the points) and rejects an empty trip", () => {
    assert.deepEqual(tripBounds([{ latitude: 1, longitude: 2 }, { latitude: 3, longitude: -4 }]), [[-4, 1], [2, 3]]);
    assert.throws(() => tripBounds([]));
  });

  test("the trip is small compared with Georgia (that is why a country view is too zoomed out to see the route)", () => {
    const [[west, south], [east, north]] = DEMO_TRIP_BOUNDS;
    assert.ok(east - west < 0.05 && north - south < 0.05);
  });
});

describe("formatting", () => {
  test("distance", () => {
    assert.equal(formatDistance(850), "850 m");
    assert.equal(formatDistance(5149), "5.1 km");
  });
  test("duration", () => {
    assert.equal(formatDuration(41 * 60), "41 min");
    assert.equal(formatDuration(3840), "1 h 04 min");
  });
});

describe("the preview page: development-only, routed along roads, never faked", () => {
  test("it returns 404 in production and is never prerendered", () => {
    assert.match(
      page,
      /shouldBlockDevelopmentOnlyPath\("\/map-preview", process\.env\.NODE_ENV, process\.env\.ATLAS_DEPLOYMENT_ENV\)\) notFound\(\)/
    );
    assert.match(page, /export const dynamic = "force-dynamic"/);
  });

  test("the route comes from the existing routing integration, visiting the stops in order and returning to the hotel", () => {
    assert.match(page, /getWalkingRouteInOrder\(/);
    assert.match(page, /stops: DEMO_STOPS\.map/);
    assert.match(page, /returnToOrigin: true/);
    assert.match(page, /origin: \{ lat: DEMO_HOTEL\.latitude, lng: DEMO_HOTEL\.longitude \}/);
  });

  test("no straight-line route is ever built: the only geometry comes from the routing result, and a failure shows a message instead", () => {
    assert.doesNotMatch(page, /type:\s*["']LineString["']/);
    assert.doesNotMatch(page, /coordinates\s*:/);
    assert.match(page, /route=\{outcome\.ok \? outcome\.route\.geometry : null\}/);
    assert.match(page, /A straight line is never drawn/);
  });

  test("Mapbox is used only to ROUTE: no search, geocoding or Places API, and no recommendation logic", () => {
    assert.doesNotMatch(pageCode, /geocod|search|places\/v1|mapbox-places|searchbox/i);
    assert.doesNotMatch(pageCode, /@\/services\/eligibility|getEligible|listEligible|requireUser|@\/auth|@\/db(?!\/queries\/places)/);
  });

  test("it never writes to or reads from the database, and never exposes a token to the client", () => {
    assert.doesNotMatch(page, /@\/db\//);
    assert.doesNotMatch(page, /console\.(log|info|warn|error)/);
    // The token only feeds the routing call; it is never passed to a client component as a prop.
    assert.doesNotMatch(page, /accessToken=|token=\{/);
  });

  test("it is clearly labelled demo-only and uses the isolated preview mode with the trip as the focus area", () => {
    assert.match(page, /DEMO ONLY/);
    assert.match(page, /isolatedPreview/);
    assert.match(page, /focusBounds=\{DEMO_TRIP_BOUNDS\}/);
    assert.match(page, /itineraryStops=\{demoStopViews\}/);
  });
});
