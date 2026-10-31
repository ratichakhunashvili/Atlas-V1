import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HotelEvent } from "@/db/schema";
import { chooseEventForPlan, eventDurationMinutes, evaluateEventForPlan } from "./hotel-events";
import { placementForDay, placementForEvent } from "./stop-placement";

const HOTEL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const HOTEL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const VENUE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const NOW = new Date("2026-10-14T12:00:00Z");

function event(overrides: Partial<HotelEvent> = {}): HotelEvent {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    hotelId: HOTEL_A,
    venuePlaceId: VENUE,
    title: "Wine tasting",
    description: null,
    startsAt: new Date("2026-10-14T13:00:00Z"),
    endsAt: new Date("2026-10-14T14:00:00Z"),
    status: "scheduled",
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const eligible = new Set([VENUE]);

function evaluate(e: HotelEvent, overrides: { hotelId?: string; eligiblePlaceIds?: ReadonlySet<string>; availableMinutes?: number } = {}) {
  return evaluateEventForPlan({
    event: e,
    hotelId: overrides.hotelId ?? HOTEL_A,
    eligiblePlaceIds: overrides.eligiblePlaceIds ?? eligible,
    now: NOW,
    availableMinutes: overrides.availableMinutes ?? 180,
  });
}

describe("which events a guest may be offered", () => {
  it("accepts this hotel's own scheduled event at an eligible venue, inside the window", () => {
    assert.equal(evaluate(event()).ok, true);
  });

  it("never offers another hotel's event", () => {
    const result = evaluate(event({ hotelId: HOTEL_B }));
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "wrong_hotel");
  });

  it("never offers a cancelled event", () => {
    const result = evaluate(event({ status: "cancelled" }));
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "cancelled");
  });

  it("refuses an event whose venue is not eligible for this hotel", () => {
    const result = evaluate(event(), { eligiblePlaceIds: new Set<string>() });
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "venue_not_eligible");
  });

  it("refuses an event that has already started — nobody is sent to arrive halfway through", () => {
    const result = evaluate(event({ startsAt: new Date("2026-10-14T11:30:00Z"), endsAt: new Date("2026-10-14T13:00:00Z") }));
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "already_started");
  });

  it("refuses an event that would end after the guest's free time runs out", () => {
    const result = evaluate(
      event({ startsAt: new Date("2026-10-14T13:00:00Z"), endsAt: new Date("2026-10-14T16:00:00Z") }),
      { availableMinutes: 120 }
    );
    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "ends_after_window");
  });

  it("accepts an event that ends exactly as the window closes", () => {
    const result = evaluate(
      event({ startsAt: new Date("2026-10-14T13:00:00Z"), endsAt: new Date("2026-10-14T14:00:00Z") }),
      { availableMinutes: 120 }
    );
    assert.equal(result.ok, true);
  });
});

describe("choosing one event for a plan", () => {
  it("returns none when nothing is compatible", () => {
    const chosen = chooseEventForPlan({
      events: [event({ status: "cancelled" }), event({ hotelId: HOTEL_B })],
      hotelId: HOTEL_A,
      eligiblePlaceIds: eligible,
      now: NOW,
      availableMinutes: 180,
    });
    assert.equal(chosen, null);
  });

  it("takes the soonest compatible one, deterministically", () => {
    const later = event({ id: "22222222-2222-4222-8222-222222222222", startsAt: new Date("2026-10-14T14:00:00Z"), endsAt: new Date("2026-10-14T14:30:00Z") });
    const sooner = event({ id: "33333333-3333-4333-8333-333333333333", startsAt: new Date("2026-10-14T12:30:00Z"), endsAt: new Date("2026-10-14T13:00:00Z") });

    const first = chooseEventForPlan({ events: [later, sooner], hotelId: HOTEL_A, eligiblePlaceIds: eligible, now: NOW, availableMinutes: 180 });
    const second = chooseEventForPlan({ events: [sooner, later], hotelId: HOTEL_A, eligiblePlaceIds: eligible, now: NOW, availableMinutes: 180 });

    assert.equal(first?.id, sooner.id);
    assert.equal(second?.id, sooner.id, "input order must not change the outcome");
  });

  it("budgets the event's own length", () => {
    assert.equal(eventDurationMinutes(event()), 60);
    assert.equal(
      eventDurationMinutes(event({ startsAt: new Date("2026-10-14T13:00:00Z"), endsAt: new Date("2026-10-14T13:45:00Z") })),
      45
    );
  });
});

describe("where a hotel activity sits in the day", () => {
  it("alternates by day so a stay is not three identical mornings", () => {
    assert.equal(placementForDay(1), "first");
    assert.equal(placementForDay(2), "last");
    assert.equal(placementForDay(3), "first");
    assert.equal(placementForDay(4), "last");
  });

  it("puts an event that starts soon at the beginning", () => {
    const placement = placementForEvent({
      startsAt: new Date("2026-10-14T12:30:00Z"),
      now: NOW,
      availableMinutes: 180,
    });
    assert.equal(placement, "first");
  });

  it("puts an event late in the window at the end — it cannot be done first", () => {
    const placement = placementForEvent({
      startsAt: new Date("2026-10-14T14:30:00Z"),
      now: NOW,
      availableMinutes: 180,
    });
    assert.equal(placement, "last");
  });
});
