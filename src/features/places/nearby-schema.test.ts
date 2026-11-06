import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { MAX_MAP_RADIUS_METERS, MIN_MAP_RADIUS_METERS } from "@/services/eligibility";
import { nearbyQuerySchema, viewportQuerySchema } from "./nearby-schema";

describe("nearbyQuerySchema (the /api/places/nearby query)", () => {
  test("accepts a normal map area", () => {
    const parsed = nearbyQuerySchema.safeParse({ lat: "41.7", lng: "44.8", radius: "5000" });
    assert.equal(parsed.success, true);
  });

  test("rejects a radius above the server-side maximum (400 in the route) and below the minimum", () => {
    assert.equal(nearbyQuerySchema.safeParse({ lat: 41.7, lng: 44.8, radius: MAX_MAP_RADIUS_METERS + 1 }).success, false);
    assert.equal(nearbyQuerySchema.safeParse({ lat: 41.7, lng: 44.8, radius: MIN_MAP_RADIUS_METERS - 1 }).success, false);
    assert.equal(nearbyQuerySchema.safeParse({ lat: 41.7, lng: 44.8, radius: "Infinity" }).success, false);
  });

  test("rejects out-of-range or missing coordinates", () => {
    assert.equal(nearbyQuerySchema.safeParse({ lat: 91, lng: 0 }).success, false);
    assert.equal(nearbyQuerySchema.safeParse({ lat: 0, lng: 181 }).success, false);
    assert.equal(nearbyQuerySchema.safeParse({ lat: "abc", lng: 0 }).success, false);
  });

  test("a forged hotelId / placeId in the query is stripped and never reaches the service", () => {
    const parsed = nearbyQuerySchema.safeParse({ lat: 41.7, lng: 44.8, radius: 1000, hotelId: "someone-elses-hotel", placeId: "any-place" });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.deepEqual(Object.keys(parsed.data).sort(), ["lat", "lng", "radius"]);
    }
  });
});

describe("viewportQuerySchema (the /api/places/viewport query, phase C3)", () => {
  test("accepts a box and strips a forged hotelId / placeId", () => {
    const parsed = viewportQuerySchema.safeParse({ south: "41.69", west: "44.79", north: "41.71", east: "44.81", hotelId: "x", placeId: "y" });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.deepEqual(Object.keys(parsed.data).sort(), ["east", "north", "south", "west"]);
  });

  test("rejects an inverted box, out-of-range or missing edges", () => {
    assert.equal(viewportQuerySchema.safeParse({ south: 42, west: 44, north: 41, east: 45 }).success, false);
    assert.equal(viewportQuerySchema.safeParse({ south: -91, west: 44, north: 41, east: 45 }).success, false);
    assert.equal(viewportQuerySchema.safeParse({ south: 41, west: 44, north: 42 }).success, false);
  });
});
