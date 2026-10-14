import { describe, test } from "node:test";
import assert from "node:assert/strict";
import type { ItineraryDay, ItineraryStop } from "@/db/schema";
import {
  contextFromEligible,
  evaluatePendingStops,
  evaluateStopAvailability,
  unavailableMessage,
  type AvailabilityContext,
} from "./stop-availability";

const NOW = new Date("2026-06-15T12:00:00Z");

// Fixed ids: nothing depends on counters or test order.
const IDS = {
  stay: "00000000-0000-4000-8000-0000000000a1",
  otherStay: "00000000-0000-4000-8000-0000000000a2",
  hotel: "00000000-0000-4000-8000-0000000000b1",
  otherHotel: "00000000-0000-4000-8000-0000000000b2",
  day: "00000000-0000-4000-8000-0000000000c1",
  placeA: "00000000-0000-4000-8000-0000000000d1",
  placeB: "00000000-0000-4000-8000-0000000000d2",
  placeC: "00000000-0000-4000-8000-0000000000d3",
  stop1: "00000000-0000-4000-8000-0000000000e1",
  stop2: "00000000-0000-4000-8000-0000000000e2",
  stop3: "00000000-0000-4000-8000-0000000000e3",
} as const;

function day(overrides: Partial<ItineraryDay> = {}): ItineraryDay {
  return {
    id: IDS.day,
    userId: "00000000-0000-4000-8000-0000000000f1",
    hotelId: IDS.hotel,
    hotelStayId: IDS.stay,
    dayNumber: 1,
    stopCount: 3,
    routeGeoJson: null,
    totalDurationSeconds: 3600,
    originalDurationSeconds: 3600,
    generatedAt: new Date("2026-06-15T08:00:00Z"),
    completedAt: null,
    ...overrides,
  };
}

function stop(id: string, placeId: string | null, position: number, overrides: Partial<ItineraryStop> = {}): ItineraryStop {
  return {
    id,
    dayId: IDS.day,
    placeId,
    isHotelStop: false,
    checkInMethod: "gps",
    name: `Stop at ${placeId ?? "deleted place"}`,
    category: "restaurant",
    latitude: 41.7,
    longitude: 44.8,
    imageUrl: null,
    position,
    visitedAt: null,
    supersededAt: null,
    supersededReason: null,
    ...overrides,
  };
}

const eligibleContext = (placeIds: string[]): AvailabilityContext =>
  contextFromEligible(
    { id: IDS.stay, hotel: { id: IDS.hotel }, checkIn: new Date("2026-06-15T08:00:00Z"), checkOut: null },
    placeIds.map((id) => ({ place: { id } as never })),
    NOW
  );

describe("evaluateStopAvailability — each cause of unavailability", () => {
  const pending = stop(IDS.stop1, IDS.placeA, 0);

  test("available when the guest's stay is valid, the day belongs to it, and the Place is eligible", () => {
    assert.deepEqual(evaluateStopAvailability(pending, day(), eligibleContext([IDS.placeA])), { available: true });
  });

  test("not_eligible: the Place is no longer in the hotel's eligible set (partnership suspended / revoked / expired, facility inactive, Place unpublished / unverified / archived)", () => {
    assert.deepEqual(evaluateStopAvailability(pending, day(), eligibleContext([IDS.placeB])), { available: false, reason: "not_eligible" });
    assert.deepEqual(evaluateStopAvailability(pending, day(), eligibleContext([])), { available: false, reason: "not_eligible" });
  });

  test("place_removed: the stop no longer points at a Place", () => {
    assert.deepEqual(evaluateStopAvailability(stop(IDS.stop1, null, 0), day(), eligibleContext([IDS.placeA])), {
      available: false,
      reason: "place_removed",
    });
  });

  test("no_valid_stay: the guest has no valid active stay (ended, not started, none)", () => {
    const none = contextFromEligible(null, [], NOW);
    assert.deepEqual(evaluateStopAvailability(pending, day(), none), { available: false, reason: "no_valid_stay" });
  });

  test("different_stay: the day belongs to another stay, another hotel, or has no stay at all", () => {
    const ctx = eligibleContext([IDS.placeA]);
    assert.deepEqual(evaluateStopAvailability(pending, day({ hotelStayId: IDS.otherStay }), ctx), { available: false, reason: "different_stay" });
    assert.deepEqual(evaluateStopAvailability(pending, day({ hotelId: IDS.otherHotel }), ctx), { available: false, reason: "different_stay" });
    assert.deepEqual(evaluateStopAvailability(pending, day({ hotelStayId: null }), ctx), { available: false, reason: "different_stay" });
  });

  test("every reason has a plain-language message", () => {
    for (const reason of ["no_valid_stay", "different_stay", "place_removed", "not_eligible"] as const) {
      assert.ok(unavailableMessage(reason).length > 10, reason);
    }
  });
});

describe("evaluatePendingStops — completed and superseded stops are never evaluated", () => {
  test("only pending active stops appear in the result", () => {
    const completed = stop(IDS.stop1, IDS.placeA, 0, { visitedAt: new Date("2026-06-15T09:00:00Z") });
    const pendingStop = stop(IDS.stop2, IDS.placeB, 1);
    const superseded = stop(IDS.stop3, IDS.placeC, 2, { supersededAt: new Date("2026-06-15T10:00:00Z"), supersededReason: "stop_unavailable" });
    // Even with NOTHING eligible, the completed stop is not flagged: history is untouched.
    const result = evaluatePendingStops([completed, pendingStop, superseded], day(), eligibleContext([]));
    assert.deepEqual([...result.keys()], [IDS.stop2]);
    assert.equal(result.get(IDS.stop2)?.available, false);
  });
});
