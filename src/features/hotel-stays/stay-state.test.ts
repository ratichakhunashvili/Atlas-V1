import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STAY_DATES_HREF, guestStayState, noPlacesCopy, stayStateCopy, type GuestStayState } from "./stay-state";

const NOW = new Date("2026-11-13T09:00:00Z");
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const stay = (checkIn: Date, expectedCheckOut: Date | null = null, checkOut: Date | null = null) => ({
  hotelName: "Atlas Test Hotel A",
  checkIn,
  expectedCheckOut,
  checkOut,
});

describe("guestStayState: the same rule eligibility applies", () => {
  it("no stay, or a checked-out stay, is no current stay", () => {
    assert.deepEqual(guestStayState(null, NOW), { kind: "none" });
    assert.deepEqual(guestStayState(stay(day("2026-11-01"), null, day("2026-11-05")), NOW), { kind: "none" });
  });

  it("a stay whose arrival is a later day has not started yet, and says when it starts", () => {
    assert.deepEqual(guestStayState(stay(day("2026-11-14"), day("2026-11-16")), NOW), {
      kind: "not_started",
      hotelName: "Atlas Test Hotel A",
      startsOn: day("2026-11-14"),
    });
  });

  it("a stay starting later today is already active (check-in day counts as day 1)", () => {
    assert.equal(guestStayState(stay(new Date("2026-11-13T20:00:00Z")), NOW).kind, "active");
  });

  it("is active through the declared departure day, inclusive", () => {
    assert.equal(guestStayState(stay(day("2026-11-09"), day("2026-11-13")), NOW).kind, "active");
    assert.equal(guestStayState(stay(day("2026-11-09")), NOW).kind, "active");
  });

  it("is ended once the declared departure day has passed", () => {
    assert.deepEqual(guestStayState(stay(day("2026-11-09"), day("2026-11-12")), NOW), { kind: "ended", hotelName: "Atlas Test Hotel A" });
  });
});

describe("stayStateCopy", () => {
  it("shows the screen's normal content for an active stay", () => {
    assert.equal(stayStateCopy({ kind: "active", hotelName: "H" }), null);
  });

  it("no stay: asks the guest to check in", () => {
    const copy = stayStateCopy({ kind: "none" });
    assert.equal(copy?.title, "No hotel stay yet");
    assert.deepEqual(copy?.actions, [{ label: "Go to check in", href: "/" }]);
  });

  it("not started: says when and at which hotel, and offers the stay-date editor instead of a re-scan", () => {
    const copy = stayStateCopy({ kind: "not_started", hotelName: "Atlas Test Hotel A", startsOn: day("2026-11-14") });
    assert.equal(copy?.title, "Your stay hasn't started yet");
    assert.match(copy?.body ?? "", /Atlas Test Hotel A starts on 14 November/);
    assert.doesNotMatch(copy?.body ?? "", /No hotel stay|scan your hotel/i);
    assert.deepEqual(copy?.actions, [{ label: "Change your dates", href: STAY_DATES_HREF }]);
  });

  it("formats the start day as the calendar day chosen, whatever the server's time zone", () => {
    const copy = stayStateCopy({ kind: "not_started", hotelName: "H", startsOn: day("2026-12-01") });
    assert.match(copy?.body ?? "", /starts on 1 December/);
  });

  it("ended: says it ended, and offers both changing the dates and checking in elsewhere", () => {
    const copy = stayStateCopy({ kind: "ended", hotelName: "Atlas Test Hotel B" });
    assert.equal(copy?.title, "Your stay has ended");
    assert.match(copy?.body ?? "", /Atlas Test Hotel B is past its dates/);
    assert.deepEqual(
      copy?.actions.map((action) => action.href),
      [STAY_DATES_HREF, "/"]
    );
  });

  it("never mentions contracts, commission or approval", () => {
    const states: GuestStayState[] = [
      { kind: "none" },
      { kind: "not_started", hotelName: "H", startsOn: day("2026-11-14") },
      { kind: "ended", hotelName: "H" },
    ];
    for (const state of states) {
      const copy = noPlacesCopy(state);
      const text = [copy.title, copy.body, ...copy.actions.map((action) => action.label)].join(" ");
      assert.doesNotMatch(text, /contract|commission|approv/i, state.kind);
    }
  });

  it("noPlacesCopy falls back to the no-stay words if the stay turned active between two reads", () => {
    assert.equal(noPlacesCopy({ kind: "active", hotelName: "H" }).title, "No hotel stay yet");
  });

  it("the editor link opens the stay pill's panel on Things to do", () => {
    assert.equal(STAY_DATES_HREF, "/experiences?stay=dates");
  });
});
