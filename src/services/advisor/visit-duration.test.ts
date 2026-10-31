import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLACE_CATEGORIES } from "@/db/schema";
import {
  CATEGORY_VISIT_DURATION_MINUTES,
  DEFAULT_VISIT_DURATION_MINUTES,
  resolveVisitDuration,
  savedStopVisitMinutes,
} from "./visit-duration";

describe("how long a stop takes", () => {
  it("uses what the admin configured, and says so", () => {
    const resolved = resolveVisitDuration({ category: "museum", visitDurationMinutes: 25 });
    assert.deepEqual(resolved, { minutes: 25, source: "configured" });
  });

  it("falls back to an explicit per-category estimate when nothing is configured", () => {
    const resolved = resolveVisitDuration({ category: "museum", visitDurationMinutes: null });
    assert.equal(resolved.minutes, CATEGORY_VISIT_DURATION_MINUTES.museum);
    assert.equal(resolved.source, "category_estimate", "the UI must be able to label it an estimate");
  });

  it("is deterministic: the same Place always produces the same number", () => {
    const place = { category: "restaurant" as const, visitDurationMinutes: null };
    const first = resolveVisitDuration(place);
    const second = resolveVisitDuration(place);
    assert.deepEqual(first, second);
  });

  it("never treats a missing duration as zero, for any category", () => {
    for (const category of PLACE_CATEGORIES) {
      const resolved = resolveVisitDuration({ category, visitDurationMinutes: null });
      assert.ok(resolved.minutes > 0, `${category} must cost the guest some time`);
    }
  });

  it("covers every category, so no Place silently falls through to a default", () => {
    for (const category of PLACE_CATEGORIES) {
      assert.equal(typeof CATEGORY_VISIT_DURATION_MINUTES[category], "number", `${category} needs an estimate`);
    }
  });

  it("treats a zero or negative stored value as unconfigured rather than as free", () => {
    for (const bad of [0, -30]) {
      const resolved = resolveVisitDuration({ category: "spa", visitDurationMinutes: bad });
      assert.equal(resolved.source, "category_estimate");
      assert.ok(resolved.minutes > 0);
    }
  });
});

describe("a stop saved before the Advisor budgeted time", () => {
  it("reports its snapshot as known when it has one", () => {
    assert.deepEqual(savedStopVisitMinutes({ visitDurationMinutes: 40, category: "museum" }), {
      minutes: 40,
      known: true,
    });
  });

  it("is reported as an unknown estimate, never as zero", () => {
    const resolved = savedStopVisitMinutes({ visitDurationMinutes: null, category: "museum" });
    assert.equal(resolved.known, false);
    assert.ok(resolved.minutes > 0);
  });

  it("still returns something usable when even the category is gone", () => {
    const resolved = savedStopVisitMinutes({ visitDurationMinutes: null, category: null });
    assert.equal(resolved.minutes, DEFAULT_VISIT_DURATION_MINUTES);
    assert.equal(resolved.known, false);
  });
});
