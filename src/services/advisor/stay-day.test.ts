import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateDayNumber } from "./stay-day";

test("check-in's own calendar date is Day 1", () => {
  const checkIn = new Date("2026-03-10T22:00:00Z");
  const now = new Date("2026-03-10T22:05:00Z");
  const result = calculateDayNumber(checkIn, null, now);
  assert.deepEqual(result, { ok: true, dayNumber: 1 });
});

test("the next calendar date is Day 2, even less than 24h after check-in", () => {
  const checkIn = new Date("2026-03-10T23:50:00Z");
  const now = new Date("2026-03-11T00:10:00Z");
  const result = calculateDayNumber(checkIn, null, now);
  assert.deepEqual(result, { ok: true, dayNumber: 2 });
});

test("increments correctly several calendar days later", () => {
  const checkIn = new Date("2026-03-10T08:00:00Z");
  const now = new Date("2026-03-14T08:00:00Z");
  const result = calculateDayNumber(checkIn, null, now);
  assert.deepEqual(result, { ok: true, dayNumber: 5 });
});

test("rejects a date before check-in", () => {
  const checkIn = new Date("2026-03-10T08:00:00Z");
  const now = new Date("2026-03-09T08:00:00Z");
  const result = calculateDayNumber(checkIn, null, now);
  assert.equal(result.ok, false);
});

test("rejects a date after checkout", () => {
  const checkIn = new Date("2026-03-10T08:00:00Z");
  const checkOut = new Date("2026-03-12T11:00:00Z");
  const now = new Date("2026-03-13T08:00:00Z");
  const result = calculateDayNumber(checkIn, checkOut, now);
  assert.equal(result.ok, false);
});

test("the checkout's own calendar date is still within the stay", () => {
  const checkIn = new Date("2026-03-10T08:00:00Z");
  const checkOut = new Date("2026-03-12T11:00:00Z");
  const now = new Date("2026-03-12T09:00:00Z");
  const result = calculateDayNumber(checkIn, checkOut, now);
  assert.deepEqual(result, { ok: true, dayNumber: 3 });
});
