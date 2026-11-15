import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { selectDaysNeedingFeedback } from "@/db/operations/plan-day-feedback";
import { dayNeedsFeedback, NO_TODAY, todayFromPlanState } from "@/services/feedback/needs-feedback";
import { adminFeedbackHref, parseAdminFeedbackParams } from "./admin-filter";
import { FEEDBACK_COPY } from "./copy";
import { FEEDBACK_SEGMENTS, FEEDBACK_TOPICS, NOT_USED_LABEL, SEGMENT_HINTS, SEGMENT_LABELS, TOPIC_LABELS } from "./segments";
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
  it("needs a topic from the list and a comment, trimmed", () => {
    const parsed = parseFeedbackForm(form({ topic: "money", comment: "  Taxi cost more than shown\r\nat night  " }));
    assert.ok(parsed.ok);
    assert.equal(parsed.dayId, DAY);
    assert.deepEqual(parsed.submission, { topic: "money", comment: "Taxi cost more than shown\nat night" });
    for (const topic of FEEDBACK_TOPICS) assert.ok(parseFeedbackForm(form({ topic, comment: "x" })).ok, topic);
  });

  it("refuses a missing or unknown topic", () => {
    for (const topic of [undefined, "", "overall", "x' or 1=1", "Money"]) {
      const parsed = parseFeedbackForm(form(topic === undefined ? { comment: "x" } : { topic, comment: "x" }));
      assert.ok(!parsed.ok && parsed.reason === "invalid", String(topic));
      assert.equal(parsed.fieldErrors.topic, FEEDBACK_ERRORS.topicRequired);
    }
  });

  it("refuses an empty comment and one over 1000 characters, counting a line break once", () => {
    for (const comment of [undefined, "", "   \n  "]) {
      const parsed = parseFeedbackForm(form(comment === undefined ? { topic: "map" } : { topic: "map", comment }));
      assert.ok(!parsed.ok && parsed.reason === "invalid", JSON.stringify(comment));
      assert.equal(parsed.fieldErrors.comment, FEEDBACK_ERRORS.commentRequired);
    }
    assert.ok(parseFeedbackForm(form({ topic: "map", comment: "x".repeat(1000) })).ok);
    assert.ok(parseFeedbackForm(form({ topic: "map", comment: `${"x".repeat(499)}\r\n${"y".repeat(500)}` })).ok);
    const parsed = parseFeedbackForm(form({ topic: "map", comment: "x".repeat(1001) }));
    assert.ok(!parsed.ok && parsed.reason === "invalid");
    assert.equal(parsed.fieldErrors.comment, FEEDBACK_ERRORS.commentTooLong);
  });

  it("refuses a day id that is not a UUID", () => {
    const data = form({ topic: "map", comment: "x" });
    data.set("dayId", "../../other-day");
    assert.deepEqual(parseFeedbackForm(data), { ok: false, reason: "invalid_day" });
  });

  it("focuses the topic first, then the comment", () => {
    assert.equal(firstInvalidField({ comment: "x", topic: "y" }), "topic");
    assert.equal(firstInvalidField({ comment: "x" }), "comment");
    assert.equal(firstInvalidField({}), null);
  });

  it("offers the six topics plus Something else, in this order", () => {
    assert.deepEqual([...FEEDBACK_TOPICS], ["technical", "map", "places", "checkin", "money", "hotel", "other"]);
    assert.equal(TOPIC_LABELS.other, "Something else");
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
    assert.equal(FEEDBACK_COPY.commentLabel, "Your comment");
    assert.equal(FEEDBACK_COPY.topicLabel, "What is it about?");
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

  it("keeps only a real hotel, a known topic and a positive page", () => {
    assert.deepEqual(parseAdminFeedbackParams({ hotel: "h1", topic: "map", page: "3" }, hotels), { hotelId: "h1", topic: "map", guestId: undefined, page: 3 });
    assert.deepEqual(parseAdminFeedbackParams({ hotel: "nope", topic: "x' or 1=1", page: "-2" }, hotels), { hotelId: undefined, topic: undefined, guestId: undefined, page: 1 });
    assert.deepEqual(parseAdminFeedbackParams({ hotel: ["h1", "h2"], page: "1.5" }, hotels), { hotelId: "h1", topic: undefined, guestId: undefined, page: 1 });
  });

  it("filters to one guest by account id only, never by an email or anything else", () => {
    const id = "6A2A0000-0000-4000-8000-000000000001";
    assert.equal(parseAdminFeedbackParams({ guest: id }, hotels).guestId, id.toLowerCase());
    assert.equal(parseAdminFeedbackParams({ guest: "guest@example.test" }, hotels).guestId, undefined);
    assert.equal(parseAdminFeedbackParams({ guest: "x' or 1=1" }, hotels).guestId, undefined);
    assert.equal(adminFeedbackHref({ guestId: "abc", page: 1 }, 2), "/admin/feedback?guest=abc&page=2");
  });

  it("keeps the filter across pages", () => {
    assert.equal(adminFeedbackHref({ hotelId: "h1", topic: "money", page: 1 }, 2), "/admin/feedback?hotel=h1&topic=money&page=2");
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
