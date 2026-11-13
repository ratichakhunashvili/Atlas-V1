import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { eventCardLine, eventDayLabel, eventTimeRange, eventWhen, eventsByVenue, isHappeningNow } from "./guest-display";

/** Event times on the guest map read in Tbilisi time (UTC+04:00 all year), whatever the server's own zone. */

// 2026-11-13 14:00 in Tbilisi (a Friday).
const NOW = new Date("2026-11-13T10:00:00Z");
const tbilisi = (local: string) => new Date(`${local}+04:00`);

describe("event day labels", () => {
  it("says Today and Tomorrow by the Tbilisi calendar, not the UTC one", () => {
    assert.equal(eventDayLabel(tbilisi("2026-11-13T23:30"), NOW), "Today");
    // 00:30 on the 14th in Tbilisi is still the 13th in UTC.
    assert.equal(eventDayLabel(tbilisi("2026-11-14T00:30"), NOW), "Tomorrow");
    assert.equal(eventDayLabel(tbilisi("2026-11-14T23:59"), NOW), "Tomorrow");
  });

  it("names the weekday and date further out", () => {
    assert.equal(eventDayLabel(tbilisi("2026-11-15T10:00"), NOW), "Sun 15 Nov");
    assert.equal(eventDayLabel(tbilisi("2026-11-20T19:00"), NOW), "Fri 20 Nov");
  });
});

describe("when an event is", () => {
  it("reads 'Today 19:00' for a start later today", () => {
    assert.equal(eventWhen({ startsAt: tbilisi("2026-11-13T19:00"), endsAt: tbilisi("2026-11-13T21:00") }, NOW), "Today 19:00");
  });

  it("writes midnight as 00:00", () => {
    assert.equal(eventWhen({ startsAt: tbilisi("2026-11-14T00:00"), endsAt: tbilisi("2026-11-14T01:00") }, NOW), "Tomorrow 00:00");
  });

  it("says an event already under way is on now, and until when", () => {
    const underWay = { startsAt: tbilisi("2026-11-13T13:30"), endsAt: tbilisi("2026-11-13T15:15") };
    assert.equal(isHappeningNow(underWay, NOW), true);
    assert.equal(eventWhen(underWay, NOW), "Now · until 15:15");
  });

  it("gives the day and time range, across midnight too", () => {
    assert.equal(eventTimeRange({ startsAt: tbilisi("2026-11-13T19:00"), endsAt: tbilisi("2026-11-13T21:00") }, NOW), "Today 19:00–21:00");
    assert.equal(
      eventTimeRange({ startsAt: tbilisi("2026-11-14T22:00"), endsAt: tbilisi("2026-11-15T01:00") }, NOW),
      "Tomorrow 22:00 – Sun 15 Nov 01:00"
    );
  });

  it("makes the place card line", () => {
    assert.equal(eventCardLine({ title: "Wine tasting", when: "Today 19:00" }), "Event · Today 19:00 · Wine tasting");
  });

  it("never words an event as something booked or reserved", () => {
    const words = [
      eventWhen({ startsAt: tbilisi("2026-11-13T19:00"), endsAt: tbilisi("2026-11-13T21:00") }, NOW),
      eventTimeRange({ startsAt: tbilisi("2026-11-13T19:00"), endsAt: tbilisi("2026-11-13T21:00") }, NOW),
      eventCardLine({ title: "Wine tasting", when: "Today 19:00" }),
    ].join(" ");
    assert.doesNotMatch(words, /book|reserv|seat|ticket|contract|commission|approv/i);
  });
});

describe("attaching events to the map's places", () => {
  const base = { description: null, startsAt: tbilisi("2026-11-13T19:00"), endsAt: tbilisi("2026-11-13T21:00") };

  it("puts each event on its venue, soonest first", () => {
    const byVenue = eventsByVenue(
      [
        { ...base, id: "e2", venuePlaceId: "cafe", title: "Late quiz", startsAt: tbilisi("2026-11-14T20:00"), endsAt: tbilisi("2026-11-14T22:00") },
        { ...base, id: "e1", venuePlaceId: "cafe", title: "Wine tasting" },
        { ...base, id: "e3", venuePlaceId: "spa", title: "Spa evening" },
      ],
      ["cafe", "spa"],
      NOW
    );
    assert.deepEqual(byVenue.get("cafe")?.map((event) => [event.title, event.when, event.range]), [
      ["Wine tasting", "Today 19:00", "Today 19:00–21:00"],
      ["Late quiz", "Tomorrow 20:00", "Tomorrow 20:00–22:00"],
    ]);
    assert.equal(byVenue.get("spa")?.length, 1);
  });

  it("skips an event whose venue is not in the guest's list: an event never adds a place", () => {
    const byVenue = eventsByVenue([{ ...base, id: "e1", venuePlaceId: "elsewhere", title: "Hidden" }], ["cafe"], NOW);
    assert.equal(byVenue.size, 0);
  });
});
