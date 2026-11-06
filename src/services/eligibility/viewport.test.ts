import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { makeTestPlace } from "@/services/advisor/test-utils";
import type { EligiblePlace } from "./rules";
import { MAX_BOUNDS_SPAN_DEGREES, boundsAround, clampBounds, isWithinBounds, selectForViewport } from "./viewport";

/** Phase C3: the map's visible area only narrows an already-eligible set, nearest first, under a server cap. */

const entry = (id: string, lat: number, lng: number, source: EligiblePlace["source"] = "partner"): EligiblePlace => ({
  place: makeTestPlace({ id, category: "restaurant", latitude: lat, longitude: lng }),
  source,
  relationId: id,
  facilityType: null,
  promotion: null,
});

const BOX = boundsAround({ lat: 41.7, lng: 44.8 }, 0.01);

describe("map viewport", () => {
  test("keeps only Places inside the box, nearest the centre first", () => {
    const result = selectForViewport([entry("edge", 41.709, 44.8), entry("centre", 41.7, 44.8), entry("outside", 41.72, 44.8)], BOX);
    assert.deepEqual(result.places.map((e) => e.place.id), ["centre", "edge"]);
    assert.equal(result.truncated, false);
  });

  test("cuts at the cap and says so, keeping the hotel's own facilities ahead of the cut", () => {
    const many = Array.from({ length: 10 }, (_, i) => entry(`p${i}`, 41.7 + i / 10_000, 44.8));
    const result = selectForViewport([...many, entry("pool", 41.7095, 44.8, "facility")], BOX, 3);
    assert.deepEqual(result.places.map((e) => e.place.id), ["pool", "p0", "p1"]);
    assert.equal(result.truncated, true);
  });

  test("an oversized or inverted box is clamped around its centre, so one request can't fetch the whole catalogue", () => {
    const huge = clampBounds({ south: 89, west: 179, north: -89, east: -179 });
    assert.ok(huge.north - huge.south <= MAX_BOUNDS_SPAN_DEGREES + 1e-9);
    assert.ok(huge.east - huge.west <= MAX_BOUNDS_SPAN_DEGREES + 1e-9);
    assert.ok(huge.south <= huge.north && huge.west <= huge.east);
    assert.deepEqual(clampBounds(BOX), BOX, "a normal box is left alone");
  });

  test("the box test is inclusive at its edges", () => {
    assert.equal(isWithinBounds({ lat: BOX.north, lng: BOX.east }, BOX), true);
    assert.equal(isWithinBounds({ lat: BOX.north + 1e-6, lng: BOX.east }, BOX), false);
  });
});
