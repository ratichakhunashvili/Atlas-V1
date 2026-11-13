import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { selectDaysNeedingFeedback } from "@/db/operations/plan-day-feedback";
import { dayNeedsFeedback, NO_TODAY, todayFromPlanState } from "@/services/feedback/needs-feedback";
import { adminFeedbackHref, parseAdminFeedbackParams } from "./admin-filter";
import { FEEDBACK_COPY } from "./copy";
import { FEEDBACK_SEGMENTS, NOT_USED_LABEL, OPTIONAL_SEGMENTS, SEGMENT_HINTS, SEGMENT_LABELS } from "./segments";
import { FEEDBACK_ERRORS, firstInvalidField, parseFeedbackForm } from "./validation";

/* Phase 2, private feedback after a plan day: the pure rules, the form validation and the guest wording. */

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const DAY = "6f1c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";

describe("which days need feedback (pure rule)", () => {
  const day = (overrides: Partial<Parameters<typeof dayNeedsFeedback>[0]> = {}) => ({ dayId: "d1", dayNumber: 2, hasFeedback: false, visitedStops: 0, ...overrides });

  it("today's day: only once finished, visited or not", () => {
    assert.equal(dayNeedsFeedback(day({ visitedStops: 3 }), { dayId: "d1", finished: false }), false);
    assert.equal(dayNeedsFeedback(day({ visitedStops: 3 }), { dayId: "d1", finished: true }), true);
    assert.equal(dayNeedsFeedback(day({ visitedStops: 0 }), { dayId: "d1", finished: true }), true);
  });

  it("an earlier day: when a stop was visited", () => {
    assert.equal(dayNeedsFeedback(day({ visitedStops: 1 }), NO_TODAY), true);
    assert.equal(dayNeedsFeedback(day({ visitedStops: 0 }), NO_TODAY), false);
    assert.equal(dayNeedsFeedback(day({ dayId: "old", visitedStops: 1 }), { dayId: "d1", finished: false }), true);
  });

  it("never a day with feedback, or a set-aside day", () => {
    assert.equal(dayNeedsFeedback(day({ visitedStops: 1, hasFeedback: true }), NO_TODAY), false);
    assert.equal(dayNeedsFeedback(day({ visitedStops: 1, dayNumber: 0 }), NO_TODAY), false);
    assert.equal(dayNeedsFeedback(day({ visitedStops: 1, dayNumber: -1794400000 }), { dayId: "d1", finished: true }), false);
  });

  it("reads today from the daily plan's state", () => {
    assert.deepEqual(todayFromPlanState({ status: "no_stay" }), NO_TODAY);
    assert.deepEqual(todayFromPlanState({ status: "not_started" }), NO_TODAY);
    assert.deepEqual(todayFromPlanState({ status: "choosing", dayId: "d1" }), { dayId: "d1", finished: false });
    assert.deepEqual(todayFromPlanState({ status: "in_progress", dayId: "d1" }), { dayId: "d1", finished: false });
    assert.deepEqual(todayFromPlanState({ status: "finished", dayId: "d1" }), { dayId: "d1", finished: true });
  });

  it("orders today's day first, then the newest earlier day", () => {
    const candidate = (dayId: string, at: string, visitedStops: number) => ({
      dayId,
      dayNumber: 1,
      hasFeedback: false,
      visitedStops,
      hotelId: "h",
      hotelName: "Hotel",
      startedAt: new Date(at),
    });
    const owed = selectDaysNeedingFeedback(
      [candidate("old", "2026-11-01T09:00:00Z", 1), candidate("today", "2026-11-12T09:00:00Z", 0), candidate("newer", "2026-11-05T09:00:00Z", 2)],
      { dayId: "today", finished: true }
    );
    assert.deepEqual(owed.map((d) => d.dayId), ["today", "newer", "old"]);
  });
});

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  data.set("dayId", DAY);
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("feedback form validation", () => {
  it("needs only the overall rating; blank or \"Didn't use it\" means not used", () => {
    const parsed = parseFeedbackForm(form({ overall_rating: "4", map_rating: "none", technical_rating: "" }));
    assert.ok(parsed.ok);
    assert.equal(parsed.dayId, DAY);
    assert.deepEqual(parsed.answers.overall, { rating: 4, note: null });
    for (const segment of OPTIONAL_SEGMENTS) assert.equal(parsed.answers[segment].rating, null, segment);
  });

  it("keeps ratings 1-5 and trimmed notes; an empty note is no note", () => {
    const parsed = parseFeedbackForm(form({ overall_rating: "1", money_rating: "5", money_note: "  Taxi cost more than shown\r\nat night  ", map_note: "   " }));
    assert.ok(parsed.ok);
    assert.deepEqual(parsed.answers.money, { rating: 5, note: "Taxi cost more than shown\nat night" });
    assert.equal(parsed.answers.map.note, null);
  });

  it("refuses a missing or out-of-range overall rating and an invalid segment rating", () => {
    for (const value of [undefined, "", "0", "6", "none", "4.5", "x"]) {
      const parsed = parseFeedbackForm(form(value === undefined ? {} : { overall_rating: value }));
      assert.ok(!parsed.ok && parsed.reason === "invalid", String(value));
      assert.equal(parsed.fieldErrors.overall_rating, FEEDBACK_ERRORS.overallRequired);
    }
    const parsed = parseFeedbackForm(form({ overall_rating: "3", checkin_rating: "9" }));
    assert.ok(!parsed.ok && parsed.reason === "invalid");
    assert.equal(parsed.fieldErrors.checkin_rating, FEEDBACK_ERRORS.ratingInvalid);
  });

  it("refuses a note over 1000 characters, counting a line break once", () => {
    assert.ok(parseFeedbackForm(form({ overall_rating: "3", hotel_note: "x".repeat(1000) })).ok);
    assert.ok(parseFeedbackForm(form({ overall_rating: "3", hotel_note: `${"x".repeat(499)}\r\n${"y".repeat(500)}` })).ok);
    const parsed = parseFeedbackForm(form({ overall_rating: "3", hotel_note: "x".repeat(1001) }));
    assert.ok(!parsed.ok && parsed.reason === "invalid");
    assert.equal(parsed.fieldErrors.hotel_note, FEEDBACK_ERRORS.noteTooLong);
  });

  it("refuses a day id that is not a UUID", () => {
    const data = form({ overall_rating: "3" });
    data.set("dayId", "../../other-day");
    assert.deepEqual(parseFeedbackForm(data), { ok: false, reason: "invalid_day" });
  });

  it("focuses the first invalid field in screen order", () => {
    assert.equal(firstInvalidField({ hotel_note: "x", map_rating: "y" }), "map_rating");
    assert.equal(firstInvalidField({ overall_note: "x", overall_rating: "y" }), "overall_rating");
    assert.equal(firstInvalidField({}), null);
  });
});

describe("feedback wording", () => {
  const allText = [
    ...Object.values(SEGMENT_LABELS),
    ...Object.values(SEGMENT_HINTS),
    NOT_USED_LABEL,
    ...Object.values(FEEDBACK_ERRORS),
    ...Object.values(FEEDBACK_COPY).filter((value) => typeof value === "string"),
    FEEDBACK_COPY.dayLine("Hotel", "12 Nov 2026"),
    FEEDBACK_COPY.moreAfter(1),
    FEEDBACK_COPY.moreAfter(3),
    FEEDBACK_COPY.charactersLeft(1),
    FEEDBACK_COPY.charactersLeft(1000),
  ];

  it("has the owner's segments, labels and order", () => {
    assert.deepEqual([...FEEDBACK_SEGMENTS], ["overall", "technical", "map", "places", "checkin", "money", "hotel"]);
    assert.deepEqual(Object.values(SEGMENT_LABELS), [
      "Overall",
      "The app and technical problems",
      "Map and directions",
      "Places and recommendations",
      "Check-in and QR codes",
      "Prices and money",
      "Hotel and staff",
    ]);
    assert.equal(FEEDBACK_COPY.noteLabel, "What went wrong?");
  });

  it("never mentions contracts, commission or approval", () => {
    for (const text of allText) assert.doesNotMatch(String(text), /approv|contract|commission|signed off/i, String(text));
  });

  it("asks about prices without suggesting Atlas takes payments", () => {
    assert.match(SEGMENT_HINTS.money, /price|cost/i);
    for (const text of allText) assert.doesNotMatch(String(text), /\b(pay|paid|payment|charge|refund)/i, String(text));
  });

  it("says plainly that feedback is private to the Atlas team", () => {
    assert.match(FEEDBACK_COPY.intro, /Only the Atlas team reads this/);
  });
});

describe("admin filters", () => {
  const hotels = new Set(["h1"]);

  it("keeps only a real hotel, a known segment and a positive page", () => {
    assert.deepEqual(parseAdminFeedbackParams({ hotel: "h1", note: "map", page: "3" }, hotels), { hotelId: "h1", noteFor: "map", page: 3 });
    assert.deepEqual(parseAdminFeedbackParams({ hotel: "nope", note: "x' or 1=1", page: "-2" }, hotels), { hotelId: undefined, noteFor: undefined, page: 1 });
    assert.deepEqual(parseAdminFeedbackParams({ hotel: ["h1", "h2"], page: "1.5" }, hotels), { hotelId: "h1", noteFor: undefined, page: 1 });
  });

  it("keeps the filter across pages", () => {
    assert.equal(adminFeedbackHref({ hotelId: "h1", noteFor: "money", page: 1 }, 2), "/admin/feedback?hotel=h1&note=money&page=2");
    assert.equal(adminFeedbackHref({ page: 2 }, 1), "/admin/feedback");
  });
});

describe("feedback comes before the next plan (wiring)", () => {
  it("the start action checks owed feedback before saving anything, and maps the service's refusal to /feedback", () => {
    const actions = read("src/features/plan/actions.ts");
    const body = actions.slice(actions.indexOf("export async function startPlanAction"));
    const action = body.slice(0, body.indexOf("\n}\n"));
    assert.ok(action.indexOf("findDaysOwingFeedback(user.id)") > 0);
    assert.ok(action.indexOf("findDaysOwingFeedback(user.id)") < action.indexOf("savePreferencesFrom("), "checked before saving");
    assert.match(action, /if \(result\.reason === "feedback_required"\) redirect\("\/feedback"\);/);
  });

  it("the plan screen sends a finished day to the form; Plan my time sends an owed guest there too", () => {
    assert.match(read("src/app/(guest)/(map)/plan/page.tsx"), /state\.status === "finished"[\s\S]*redirect\("\/feedback"\)/);
    assert.match(read("src/app/(guest)/(map)/preferences/page.tsx"), /findDaysOwingFeedback\(user\.id, \{ plan \}\)\)\.owed\.length > 0\) redirect\("\/feedback"\)/);
    assert.doesNotMatch(read("src/app/(guest)/(map)/preferences/edit/page.tsx"), /feedback/, "edit preferences stays open");
  });

  it("the submit action signs the guest in on the server and never trusts the posted day alone", () => {
    const action = read("src/features/feedback/actions.ts");
    assert.ok(action.indexOf("await requireUser()") < action.indexOf("submitPlanDayFeedback("));
    assert.match(action, /findDaysOwingFeedback\(user\.id/);
    assert.match(action, /userId: user\.id/);
  });

  it("the admin screen is admin only", () => {
    assert.match(read("src/app/(console)/admin/feedback/page.tsx"), /await requireAdmin\(\);/);
  });
});
