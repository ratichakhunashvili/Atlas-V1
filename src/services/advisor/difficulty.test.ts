import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { calculateNextStopCount, MAX_STOPS, MIN_STOPS, type PreviousDayOutcome } from "./difficulty";

const GENERATED_AT = new Date("2026-01-01T00:00:00Z");
const TOTAL_DURATION_SECONDS = 3600; // 1 hour estimated

function completedAfter(seconds: number): Date {
  return new Date(GENERATED_AT.getTime() + seconds * 1000);
}

function dayOutcome(overrides: Partial<PreviousDayOutcome>): PreviousDayOutcome {
  return {
    stopCount: 4,
    allStopsVisited: true,
    completedAt: completedAfter(1000),
    generatedAt: GENERATED_AT,
    totalDurationSeconds: TOTAL_DURATION_SECONDS,
    ...overrides,
  };
}

describe("calculateNextStopCount", () => {
  test("no previous day -> MIN_STOPS (4)", () => {
    assert.equal(calculateNextStopCount(null), MIN_STOPS);
    assert.equal(MIN_STOPS, 4);
  });

  test("previous day = 4, completed but not fast (difficult) -> stays 4", () => {
    const previous = dayOutcome({ stopCount: 4, completedAt: completedAfter(3000) }); // >50% of 3600
    assert.equal(calculateNextStopCount(previous), 4);
  });

  test("previous day = 4, fully visited + completed in <50% of estimated duration -> 5", () => {
    const previous = dayOutcome({ stopCount: 4, completedAt: completedAfter(1000) }); // <1800
    assert.equal(calculateNextStopCount(previous), 5);
  });

  test("5 -> easy completion -> 6", () => {
    const previous = dayOutcome({ stopCount: 5, completedAt: completedAfter(1000) });
    assert.equal(calculateNextStopCount(previous), 6);
  });

  test("7 -> easy completion -> 8", () => {
    const previous = dayOutcome({ stopCount: 7, completedAt: completedAfter(1000) });
    assert.equal(calculateNextStopCount(previous), 8);
  });

  test("8 -> easy completion -> stays 8 (capped at MAX_STOPS)", () => {
    const previous = dayOutcome({ stopCount: 8, completedAt: completedAfter(1000) });
    assert.equal(calculateNextStopCount(previous), MAX_STOPS);
    assert.equal(MAX_STOPS, 8);
  });

  test("incomplete day (not all stops visited) -> same count, even if otherwise fast", () => {
    const previous = dayOutcome({ stopCount: 4, allStopsVisited: false, completedAt: completedAfter(100) });
    assert.equal(calculateNextStopCount(previous), 4);
  });

  test("completed but not fast enough -> same count", () => {
    const previous = dayOutcome({ stopCount: 6, completedAt: completedAfter(3500) }); // close to full estimated time
    assert.equal(calculateNextStopCount(previous), 6);
  });

  test("missing completedAt -> same count, even if allStopsVisited is true", () => {
    const previous = dayOutcome({ stopCount: 4, allStopsVisited: true, completedAt: null });
    assert.equal(calculateNextStopCount(previous), 4);
  });

  test("exact 50% completion ratio does NOT count as easy (strict less-than, not less-than-or-equal)", () => {
    const previous = dayOutcome({ stopCount: 4, completedAt: completedAfter(TOTAL_DURATION_SECONDS * 0.5) });
    assert.equal(calculateNextStopCount(previous), 4);
  });

  test("missing totalDurationSeconds -> same count, even if otherwise fast and complete", () => {
    const previous = dayOutcome({ stopCount: 4, totalDurationSeconds: null, completedAt: completedAfter(1) });
    assert.equal(calculateNextStopCount(previous), 4);
  });

  test("never decreases: a previous count above MIN_STOPS holds steady on a hard day, never drops back toward MIN_STOPS", () => {
    const previous = dayOutcome({ stopCount: 7, completedAt: completedAfter(3550) });
    assert.equal(calculateNextStopCount(previous), 7);
  });
});
