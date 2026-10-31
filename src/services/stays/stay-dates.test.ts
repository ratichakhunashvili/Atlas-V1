import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { parseCalendarDate, validateStayDates } from "./stay-dates";
import { stayReminders } from "./reminders";
import { calculateDayNumber, stayEndFor } from "@/services/advisor/stay-day";

const NOW = new Date("2026-10-19T15:30:00Z");
const base = { now: NOW, currentCheckIn: new Date("2026-10-19T09:00:00Z"), arrivalLocked: false };

describe("stay dates validation", () => {
  test("accepts a normal stay and stores arrival as a UTC date", () => {
    const result = validateStayDates({ ...base, checkIn: "2026-10-18", expectedCheckOut: "2026-10-22" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.checkIn.toISOString(), "2026-10-18T00:00:00.000Z");
      assert.equal(result.expectedCheckOut.toISOString(), "2026-10-22T00:00:00.000Z");
    }
  });

  test("rejects non-dates, including rolled-over ones", () => {
    for (const bad of ["", "2026-02-31", "2026-13-01", "tomorrow", "2026-1-1", null, undefined, 5]) {
      const result = validateStayDates({ ...base, checkIn: bad, expectedCheckOut: "2026-10-22" });
      assert.equal(result.ok, false, String(bad));
    }
    assert.equal(parseCalendarDate("2026-02-28")?.toISOString(), "2026-02-28T00:00:00.000Z");
  });

  test("bounds how far back or ahead arrival can be declared", () => {
    assert.equal(validateStayDates({ ...base, checkIn: "2026-09-01", expectedCheckOut: "2026-10-22" }).ok, false);
    assert.equal(validateStayDates({ ...base, checkIn: "2026-11-30", expectedCheckOut: "2026-12-02" }).ok, false);
    assert.equal(validateStayDates({ ...base, checkIn: "2026-10-20", expectedCheckOut: "2026-10-22" }).ok, true);
  });

  test("departure must be after arrival, not in the past, and within the maximum stay", () => {
    assert.equal(validateStayDates({ ...base, checkIn: "2026-10-19", expectedCheckOut: "2026-10-19" }).ok, false);
    assert.equal(validateStayDates({ ...base, checkIn: "2026-10-15", expectedCheckOut: "2026-10-18" }).ok, false);
    assert.equal(validateStayDates({ ...base, checkIn: "2026-10-19", expectedCheckOut: "2026-12-30" }).ok, false);
  });

  test("a locked arrival cannot move but the departure can", () => {
    const locked = { ...base, arrivalLocked: true };
    const moved = validateStayDates({ ...locked, checkIn: "2026-10-18", expectedCheckOut: "2026-10-22" });
    assert.equal(moved.ok, false);
    if (!moved.ok) assert.equal(moved.problem, "arrival_locked");

    const kept = validateStayDates({ ...locked, checkIn: "2026-10-19", expectedCheckOut: "2026-10-25" });
    assert.equal(kept.ok, true);
    if (kept.ok) assert.equal(kept.checkIn.getTime(), base.currentCheckIn.getTime(), "the exact stored arrival is kept");
  });
});

describe("a declared departure bounds planning without ending the stay", () => {
  test("stayEndFor prefers an actual check-out, then the declared departure", () => {
    const declared = new Date("2026-10-22T00:00:00Z");
    const actual = new Date("2026-10-21T10:00:00Z");
    assert.equal(stayEndFor({ checkOut: null, expectedCheckOut: declared }), declared);
    assert.equal(stayEndFor({ checkOut: actual, expectedCheckOut: declared }), actual);
    assert.equal(stayEndFor({ checkOut: null }), null);
  });

  test("the departure day itself is still a plannable day; the day after is not", () => {
    const checkIn = new Date("2026-10-19T09:00:00Z");
    const end = new Date("2026-10-21T00:00:00Z");
    assert.deepEqual(calculateDayNumber(checkIn, end, new Date("2026-10-21T20:00:00Z")), { ok: true, dayNumber: 3 });
    assert.equal(calculateDayNumber(checkIn, end, new Date("2026-10-22T01:00:00Z")).ok, false);
  });
});

describe("stay reminders come only from declared dates", () => {
  test("none without a departure, none far from it, and one on the last two days", () => {
    assert.deepEqual(stayReminders({ expectedCheckOut: null, now: NOW }), []);
    assert.deepEqual(stayReminders({ expectedCheckOut: new Date("2026-10-30T00:00:00Z"), now: NOW }), []);
    assert.equal(stayReminders({ expectedCheckOut: new Date("2026-10-20T00:00:00Z"), now: NOW })[0].id, "departure-tomorrow");
    assert.equal(stayReminders({ expectedCheckOut: new Date("2026-10-19T00:00:00Z"), now: NOW })[0].id, "departure-today");
  });
});
