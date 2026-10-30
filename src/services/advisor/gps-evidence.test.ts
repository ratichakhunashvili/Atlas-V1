import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_ACCURACY_METERS,
  MAX_CLOCK_SKEW_SECONDS,
  MAX_READING_AGE_SECONDS,
  validateGpsEvidence,
} from "./gps-evidence";

/**
 * Every boundary, and one unit either side of it.
 *
 * None of this stops a spoofed location — a patched client can report whatever it
 * likes. These rules reject readings that cannot support a proximity claim even
 * when the device is being honest.
 */

const NOW = new Date("2026-03-10T12:00:00Z");
const AT_NOW = NOW.getTime();

function evidence(overrides: Partial<Parameters<typeof validateGpsEvidence>[0]> = {}) {
  return {
    latitude: 41.7151,
    longitude: 44.8271,
    accuracyMeters: 10,
    capturedAtMs: AT_NOW,
    ...overrides,
  };
}

describe("accuracy", () => {
  it("accepts a precise fix", () => {
    assert.equal(validateGpsEvidence(evidence({ accuracyMeters: 5 }), NOW).ok, true);
  });

  it("accepts exactly the limit", () => {
    assert.equal(validateGpsEvidence(evidence({ accuracyMeters: MAX_ACCURACY_METERS }), NOW).ok, true);
  });

  it("refuses one metre past the limit", () => {
    const result = validateGpsEvidence(evidence({ accuracyMeters: MAX_ACCURACY_METERS + 1 }), NOW);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "inaccurate");
  });

  it("accepts a reported zero — it claims more precision, not less", () => {
    assert.equal(validateGpsEvidence(evidence({ accuracyMeters: 0 }), NOW).ok, true);
  });

  it("refuses a negative radius, which is not a measurement", () => {
    const result = validateGpsEvidence(evidence({ accuracyMeters: -1 }), NOW);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "invalid_accuracy");
  });

  it("refuses NaN and Infinity", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const result = validateGpsEvidence(evidence({ accuracyMeters: bad }), NOW);
      assert.equal(result.ok, false, `${bad} must be refused`);
      assert.equal(result.ok === false && result.reason, "invalid_accuracy");
    }
  });
});

describe("freshness", () => {
  it("accepts a reading taken right now", () => {
    assert.equal(validateGpsEvidence(evidence(), NOW).ok, true);
  });

  it("accepts a reading exactly at the age limit", () => {
    const at = AT_NOW - MAX_READING_AGE_SECONDS * 1000;
    assert.equal(validateGpsEvidence(evidence({ capturedAtMs: at }), NOW).ok, true);
  });

  it("refuses a reading one second past the limit", () => {
    const at = AT_NOW - (MAX_READING_AGE_SECONDS + 1) * 1000;
    const result = validateGpsEvidence(evidence({ capturedAtMs: at }), NOW);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "stale");
  });

  it("refuses a long-stale cached fix", () => {
    const result = validateGpsEvidence(evidence({ capturedAtMs: AT_NOW - 3600 * 1000 }), NOW);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "stale");
  });
});

describe("clock skew", () => {
  it("tolerates a reading slightly ahead of the server", () => {
    const at = AT_NOW + (MAX_CLOCK_SKEW_SECONDS - 1) * 1000;
    assert.equal(validateGpsEvidence(evidence({ capturedAtMs: at }), NOW).ok, true);
  });

  it("accepts a reading exactly at the skew limit", () => {
    const at = AT_NOW + MAX_CLOCK_SKEW_SECONDS * 1000;
    assert.equal(validateGpsEvidence(evidence({ capturedAtMs: at }), NOW).ok, true);
  });

  it("refuses a reading further in the future than ordinary skew", () => {
    const at = AT_NOW + (MAX_CLOCK_SKEW_SECONDS + 1) * 1000;
    const result = validateGpsEvidence(evidence({ capturedAtMs: at }), NOW);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "future_reading");
  });

  it("refuses a wildly future timestamp", () => {
    const result = validateGpsEvidence(evidence({ capturedAtMs: AT_NOW + 86_400_000 }), NOW);
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "future_reading");
  });

  it("refuses a malformed capture time", () => {
    for (const bad of [NaN, Infinity, -Infinity]) {
      const result = validateGpsEvidence(evidence({ capturedAtMs: bad }), NOW);
      assert.equal(result.ok, false);
      assert.equal(result.ok === false && result.reason, "invalid_capture_time");
    }
  });
});

describe("coordinates", () => {
  it("refuses out-of-range and malformed values", () => {
    const cases = [
      { latitude: 91 },
      { latitude: -91 },
      { longitude: 181 },
      { longitude: -181 },
      { latitude: NaN },
      { longitude: Infinity },
    ];

    for (const override of cases) {
      const result = validateGpsEvidence(evidence(override), NOW);
      assert.equal(result.ok, false, `${JSON.stringify(override)} must be refused`);
      assert.equal(result.ok === false && result.reason, "invalid_coordinates");
    }
  });

  it("accepts the extremes of the valid range", () => {
    assert.equal(validateGpsEvidence(evidence({ latitude: 90, longitude: 180 }), NOW).ok, true);
    assert.equal(validateGpsEvidence(evidence({ latitude: -90, longitude: -180 }), NOW).ok, true);
  });
});
