import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { getWalkingRouteInOrder, type RoutingOptions } from "./index";

const HOTEL = { lat: 41.7151, lng: 44.8271 };
const A = { lat: 41.6934, lng: 44.8015 };
const B = { lat: 41.6977, lng: 44.7974 };
const C = { lat: 41.7001, lng: 44.8101 };
const TOKEN: RoutingOptions = { accessToken: "test-token" };

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const GEOMETRY = { type: "LineString", coordinates: [[44.8271, 41.7151], [44.8015, 41.6934]] };

describe("getWalkingRouteInOrder — a FIXED-order route (never the optimizer)", () => {
  test("calls the Directions endpoint (not Optimization) with the waypoints in EXACTLY the given order, returning to the hotel", async (t) => {
    let url = "";
    const fetchMock = t.mock.method(globalThis, "fetch", async (u: string) => {
      url = u;
      return json({ code: "Ok", routes: [{ geometry: GEOMETRY, distance: 900, duration: 700 }] });
    });

    const result = await getWalkingRouteInOrder({ origin: HOTEL, stops: [B, A, C] }, TOKEN);

    assert.equal(fetchMock.mock.calls.length, 1);
    assert.match(url, /^https:\/\/api\.mapbox\.com\/directions\/v5\/mapbox\/walking\//);
    assert.doesNotMatch(url, /optimized-trips/);
    const expected = [HOTEL, B, A, C, HOTEL].map((p) => `${p.lng},${p.lat}`).join(";");
    assert.ok(url.includes(expected), "waypoints are hotel, B, A, C, hotel — in the order given, so retained stops are never reordered");
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.route.distanceMeters, 900);
      assert.equal(result.route.durationSeconds, 700);
      assert.equal(result.route.geometry.geometry.type, "LineString");
    }
  });

  test("returnToOrigin: false ends at the last stop", async (t) => {
    let url = "";
    t.mock.method(globalThis, "fetch", async (u: string) => {
      url = u;
      return json({ code: "Ok", routes: [{ geometry: GEOMETRY, distance: 1, duration: 1 }] });
    });
    await getWalkingRouteInOrder({ origin: HOTEL, stops: [A, B], returnToOrigin: false }, TOKEN);
    assert.ok(url.includes([HOTEL, A, B].map((p) => `${p.lng},${p.lat}`).join(";")));
  });

  test("invalid input never calls fetch: bad coordinate, no stops, too many waypoints", async (t) => {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => json({}));
    const bad = await getWalkingRouteInOrder({ origin: { lat: 999, lng: 0 }, stops: [A] }, TOKEN);
    const none = await getWalkingRouteInOrder({ origin: HOTEL, stops: [] }, TOKEN);
    const many = await getWalkingRouteInOrder({ origin: HOTEL, stops: Array.from({ length: 24 }, () => A) }, TOKEN);
    for (const result of [bad, none, many]) {
      assert.equal(result.ok, false);
      if (!result.ok) assert.equal(result.reason, "invalid_input");
    }
    assert.equal(fetchMock.mock.calls.length, 0);
  });

  test("failures are reported, never faked: http error, network error, no route, malformed response, missing token", async (t) => {
    t.mock.method(globalThis, "fetch", async () => json({}, 500));
    const http = await getWalkingRouteInOrder({ origin: HOTEL, stops: [A] }, TOKEN);
    assert.equal(!http.ok && http.reason, "http");

    t.mock.method(globalThis, "fetch", async () => {
      throw new Error("offline");
    });
    const network = await getWalkingRouteInOrder({ origin: HOTEL, stops: [A] }, TOKEN);
    assert.equal(!network.ok && network.reason, "network");

    t.mock.method(globalThis, "fetch", async () => json({ code: "Ok", routes: [] }));
    const none = await getWalkingRouteInOrder({ origin: HOTEL, stops: [A] }, TOKEN);
    assert.equal(!none.ok && none.reason, "no_route");

    t.mock.method(globalThis, "fetch", async () => json({ code: "Ok", routes: [{}] }));
    const malformed = await getWalkingRouteInOrder({ origin: HOTEL, stops: [A] }, TOKEN);
    assert.equal(!malformed.ok && malformed.reason, "malformed_response");

    const noToken = await getWalkingRouteInOrder({ origin: HOTEL, stops: [A] }, { accessToken: "" });
    assert.equal(!noToken.ok && noToken.reason, "config");
  });
});
