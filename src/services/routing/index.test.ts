import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  getWalkingDirections,
  isValidCoordinate,
  isValidRouteGeometry,
  optimizeWalkingRoute,
  type RoutingOptions,
} from "./index";

const HOTEL = { lat: 41.7151, lng: 44.8271 };
const STOP_A = { lat: 41.6934, lng: 44.8015 };
const STOP_B = { lat: 41.6977, lng: 44.7974 };
const TEST_TOKEN: RoutingOptions = { accessToken: "test-token" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const VALID_GEOMETRY = {
  type: "LineString",
  coordinates: [
    [44.8271, 41.7151],
    [44.8015, 41.6934],
  ],
};

describe("isValidCoordinate", () => {
  test("accepts a valid coordinate", () => {
    assert.equal(isValidCoordinate({ lat: 41.7, lng: 44.8 }), true);
    assert.equal(isValidCoordinate({ lat: -90, lng: -180 }), true);
    assert.equal(isValidCoordinate({ lat: 90, lng: 180 }), true);
    assert.equal(isValidCoordinate({ lat: 0, lng: 0 }), true);
  });

  test("rejects latitude > 90", () => assert.equal(isValidCoordinate({ lat: 90.1, lng: 0 }), false));
  test("rejects latitude < -90", () => assert.equal(isValidCoordinate({ lat: -90.1, lng: 0 }), false));
  test("rejects longitude > 180", () => assert.equal(isValidCoordinate({ lat: 0, lng: 180.1 }), false));
  test("rejects longitude < -180", () => assert.equal(isValidCoordinate({ lat: 0, lng: -180.1 }), false));
  test("rejects NaN", () => {
    assert.equal(isValidCoordinate({ lat: NaN, lng: 0 }), false);
    assert.equal(isValidCoordinate({ lat: 0, lng: NaN }), false);
  });
  test("rejects Infinity", () => {
    assert.equal(isValidCoordinate({ lat: Infinity, lng: 0 }), false);
    assert.equal(isValidCoordinate({ lat: 0, lng: -Infinity }), false);
  });
});

describe("optimizeWalkingRoute — input validation (no fetch should occur)", () => {
  test("rejects an invalid origin without calling fetch", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => jsonResponse({}));
    const result = await optimizeWalkingRoute({ origin: { lat: 999, lng: 0 }, stops: [STOP_A] }, TEST_TOKEN);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_input");
    assert.equal(fetchMock.mock.calls.length, 0);
  });

  test("rejects an invalid stop without calling fetch", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => jsonResponse({}));
    const result = await optimizeWalkingRoute({ origin: HOTEL, stops: [{ lat: NaN, lng: 0 }] }, TEST_TOKEN);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_input");
    assert.equal(fetchMock.mock.calls.length, 0);
  });

  test("rejects zero stops without calling fetch", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => jsonResponse({}));
    const result = await optimizeWalkingRoute({ origin: HOTEL, stops: [] }, TEST_TOKEN);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "invalid_input");
    assert.equal(fetchMock.mock.calls.length, 0);
  });
});

describe("optimizeWalkingRoute — request construction", () => {
  test("calls the Optimization endpoint once, with the walking profile, hotel-origin-first coordinate order, and roundtrip=true by default", async (t) => {
    let capturedUrl = "";
    const fetchMock = t.mock.method(globalThis, "fetch", async (url: string) => {
      capturedUrl = url;
      return jsonResponse({ code: "Ok", waypoints: [], trips: [] });
    });

    await optimizeWalkingRoute({ origin: HOTEL, stops: [STOP_A, STOP_B] }, TEST_TOKEN);

    assert.equal(fetchMock.mock.calls.length, 1);
    assert.match(capturedUrl, /^https:\/\/api\.mapbox\.com\/optimized-trips\/v1\/mapbox\/walking\//);
    assert.ok(capturedUrl.includes(`${HOTEL.lng},${HOTEL.lat};${STOP_A.lng},${STOP_A.lat};${STOP_B.lng},${STOP_B.lat}`));
    assert.ok(capturedUrl.includes("roundtrip=true"));
    assert.ok(capturedUrl.includes("source=first"));
    assert.ok(capturedUrl.includes("access_token=test-token"));
  });

  test("returnToOrigin: false maps to roundtrip=false&destination=any", async (t) => {
    let capturedUrl = "";
    t.mock.method(globalThis, "fetch", async (url: string) => {
      capturedUrl = url;
      return jsonResponse({ code: "Ok", waypoints: [], trips: [] });
    });

    await optimizeWalkingRoute({ origin: HOTEL, stops: [STOP_A], returnToOrigin: false }, TEST_TOKEN);

    assert.ok(capturedUrl.includes("roundtrip=false"));
    assert.ok(capturedUrl.includes("destination=any"));
  });
});

describe("optimizeWalkingRoute — response parsing", () => {
  test("a valid response produces a canonical OptimizedRoute, with stops reordered by waypoint_index", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      jsonResponse({
        code: "Ok",
        // Input order is [origin, stopA, stopB]; Mapbox says the trip visits
        // origin(0) -> stopB(2) -> stopA(1) -> back to origin.
        waypoints: [{ waypoint_index: 0 }, { waypoint_index: 2 }, { waypoint_index: 1 }],
        trips: [
          {
            geometry: VALID_GEOMETRY,
            distance: 9140.7,
            duration: 6592.9,
            legs: [
              { distance: 100, duration: 80 },
              { distance: 200, duration: 150 },
            ],
          },
        ],
      })
    );

    const result = await optimizeWalkingRoute({ origin: HOTEL, stops: [STOP_A, STOP_B] }, TEST_TOKEN);

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.route.order, [1, 0]); // stopB (input idx 1 in `stops`) first, then stopA
      assert.equal(result.route.totalDistanceMeters, 9140.7);
      assert.equal(result.route.totalDurationSeconds, 6592.9);
      assert.equal(result.route.geometry.type, "Feature");
      assert.equal(result.route.geometry.geometry.type, "LineString");
      assert.equal(result.route.legs.length, 2);
    }
  });

  test("code !== 'Ok' produces a no_route result, not fabricated data", async (t) => {
    t.mock.method(globalThis, "fetch", async () => jsonResponse({ code: "NoSegment", waypoints: [], trips: [] }));
    const result = await optimizeWalkingRoute({ origin: HOTEL, stops: [STOP_A] }, TEST_TOKEN);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_route");
  });

  test("an empty trips array (Ok but nothing usable) produces a no_route result", async (t) => {
    t.mock.method(globalThis, "fetch", async () => jsonResponse({ code: "Ok", waypoints: [], trips: [] }));
    const result = await optimizeWalkingRoute({ origin: HOTEL, stops: [STOP_A] }, TEST_TOKEN);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_route");
  });

  test("a malformed response (missing geometry/distance/duration) produces a malformed_response result", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      jsonResponse({ code: "Ok", waypoints: [{ waypoint_index: 0 }, { waypoint_index: 1 }], trips: [{}] })
    );
    const result = await optimizeWalkingRoute({ origin: HOTEL, stops: [STOP_A] }, TEST_TOKEN);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "malformed_response");
  });
});

describe("getWalkingDirections — request construction", () => {
  test("calls the Directions endpoint once, with the walking profile and origin-then-destination order", async (t) => {
    let capturedUrl = "";
    const fetchMock = t.mock.method(globalThis, "fetch", async (url: string) => {
      capturedUrl = url;
      return jsonResponse({ code: "Ok", routes: [{ geometry: VALID_GEOMETRY, distance: 450, duration: 300 }] });
    });

    await getWalkingDirections({ origin: HOTEL, destination: STOP_A }, TEST_TOKEN);

    assert.equal(fetchMock.mock.calls.length, 1);
    assert.match(capturedUrl, /^https:\/\/api\.mapbox\.com\/directions\/v5\/mapbox\/walking\//);
    assert.ok(capturedUrl.includes(`${HOTEL.lng},${HOTEL.lat};${STOP_A.lng},${STOP_A.lat}`));
  });
});

describe("getWalkingDirections — response parsing", () => {
  test("a valid response produces a canonical DirectionsRoute", async (t) => {
    t.mock.method(globalThis, "fetch", async () =>
      jsonResponse({ code: "Ok", routes: [{ geometry: VALID_GEOMETRY, distance: 450.3, duration: 300.1 }] })
    );
    const result = await getWalkingDirections({ origin: HOTEL, destination: STOP_A }, TEST_TOKEN);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.route.distanceMeters, 450.3);
      assert.equal(result.route.durationSeconds, 300.1);
      assert.equal(result.route.geometry.geometry.type, "LineString");
    }
  });

  test("an empty routes array produces a no_route result", async (t) => {
    t.mock.method(globalThis, "fetch", async () => jsonResponse({ code: "Ok", routes: [] }));
    const result = await getWalkingDirections({ origin: HOTEL, destination: STOP_A }, TEST_TOKEN);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "no_route");
  });
});

describe("failure handling shared by both operations", () => {
  test("an HTTP 4xx/5xx response produces an http failure, never fake route data", async (t) => {
    t.mock.method(globalThis, "fetch", async () => jsonResponse({ message: "Not Authorized" }, 401));
    const result = await getWalkingDirections({ origin: HOTEL, destination: STOP_A }, TEST_TOKEN);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "http");
  });

  test("a network failure (fetch rejects) produces a network failure", async (t) => {
    t.mock.method(globalThis, "fetch", async () => {
      throw new TypeError("fetch failed");
    });
    const result = await getWalkingDirections({ origin: HOTEL, destination: STOP_A }, TEST_TOKEN);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "network");
  });

  test("a response body that isn't valid JSON produces a malformed_response failure", async (t) => {
    t.mock.method(globalThis, "fetch", async () => new Response("not json{{{", { status: 200 }));
    const result = await getWalkingDirections({ origin: HOTEL, destination: STOP_A }, TEST_TOKEN);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "malformed_response");
  });

  test("a missing server token produces a config failure without calling fetch", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => jsonResponse({}));
    const result = await getWalkingDirections({ origin: HOTEL, destination: STOP_A }, { accessToken: "" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "config");
    assert.equal(fetchMock.mock.calls.length, 0);
  });

  test("optimizeWalkingRoute also reports a config failure for a missing token, without calling fetch", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => jsonResponse({}));
    const result = await optimizeWalkingRoute({ origin: HOTEL, stops: [STOP_A] }, { accessToken: "" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "config");
    assert.equal(fetchMock.mock.calls.length, 0);
  });
});

describe("isValidRouteGeometry", () => {
  test("accepts a well-formed Feature<LineString>, the exact shape persisted in itineraryDays.routeGeoJson", () => {
    const value = {
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: [[44.8, 41.7], [44.9, 41.8]] },
    };
    assert.equal(isValidRouteGeometry(value), true);
  });

  test("rejects null, the itinerary's own pre-routing default", () => {
    assert.equal(isValidRouteGeometry(null), false);
  });

  test("rejects a raw LineString that was never wrapped in a Feature (one level too shallow)", () => {
    assert.equal(isValidRouteGeometry({ type: "LineString", coordinates: [] }), false);
  });

  test("rejects a Feature whose geometry isn't a LineString", () => {
    assert.equal(
      isValidRouteGeometry({ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [44.8, 41.7] } }),
      false
    );
  });

  test("rejects a Feature whose coordinates aren't an array", () => {
    assert.equal(
      isValidRouteGeometry({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: "not-an-array" } }),
      false
    );
  });

  test("rejects arbitrary non-object values", () => {
    assert.equal(isValidRouteGeometry("a string"), false);
    assert.equal(isValidRouteGeometry(42), false);
    assert.equal(isValidRouteGeometry(undefined), false);
  });
});
