import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AVAILABLE_MINUTE_OPTIONS,
  estimateRoundTripMinutes,
  estimateWalkMinutes,
  fitStopsToBudget,
  fitsInBudget,
  isAvailableMinutesOption,
  remainingBudgetMinutes,
  summarisePlanTime,
  totalPlanMinutes,
} from "./time-budget";

const HOTEL = { lat: 41.7151, lng: 44.8271 };
/** Roughly 500 m east of the hotel. */
const NEAR = { lat: 41.7151, lng: 44.8331 };
/** Roughly 3 km north. */
const FAR = { lat: 41.7421, lng: 44.8271 };

describe("the windows a guest may choose", () => {
  it("offers exactly the four approved options", () => {
    assert.deepEqual([...AVAILABLE_MINUTE_OPTIONS], [60, 120, 180, 240]);
  });

  it("accepts only those values, whatever a client sends", () => {
    for (const valid of AVAILABLE_MINUTE_OPTIONS) {
      assert.equal(isAvailableMinutesOption(valid), true);
    }
    for (const invalid of [0, -60, 45, 90, 600, "120", null, undefined, NaN, Infinity]) {
      assert.equal(isAvailableMinutesOption(invalid), false, `${String(invalid)} must be refused`);
    }
  });
});

describe("estimating the walk", () => {
  it("scales with distance", () => {
    assert.ok(estimateWalkMinutes(HOTEL, FAR) > estimateWalkMinutes(HOTEL, NEAR));
  });

  it("is symmetric, and zero for standing still", () => {
    assert.equal(estimateWalkMinutes(HOTEL, HOTEL), 0);
    assert.equal(
      estimateWalkMinutes(HOTEL, NEAR).toFixed(6),
      estimateWalkMinutes(NEAR, HOTEL).toFixed(6)
    );
  });

  it("allows for streets not being straight, so it over-estimates rather than under", () => {
    // 500 m in a straight line at 1.2 m/s would be ~6.9 minutes; the detour factor
    // makes it ~9. Being late back to the hotel is the failure that matters.
    const straightLineMinutes = 0.5 / 1.2 / 60 * 1000;
    assert.ok(estimateWalkMinutes(HOTEL, NEAR) > straightLineMinutes);
  });
});

describe("estimating a round trip", () => {
  it("counts nothing for an empty plan", () => {
    assert.equal(estimateRoundTripMinutes({ hotelLocation: HOTEL, stops: [] }), 0);
  });

  it("counts the time spent at every stop", () => {
    const withShortVisits = estimateRoundTripMinutes({
      hotelLocation: HOTEL,
      stops: [{ location: NEAR, visitMinutes: 10 }],
    });
    const withLongVisits = estimateRoundTripMinutes({
      hotelLocation: HOTEL,
      stops: [{ location: NEAR, visitMinutes: 70 }],
    });

    assert.equal(Math.round(withLongVisits - withShortVisits), 60);
  });

  it("always counts the walk home — a plan that strands the guest has not fitted their time", () => {
    const outAndBack = estimateRoundTripMinutes({
      hotelLocation: HOTEL,
      stops: [{ location: FAR, visitMinutes: 0 }],
    });
    const oneWay = estimateWalkMinutes(HOTEL, FAR);

    assert.ok(outAndBack >= oneWay * 2 - 0.001, "the return leg must be included");
  });
});

describe("fitting stops into the window", () => {
  const stop = (location: { lat: number; lng: number }, visitMinutes: number, id: string) => ({
    id,
    location,
    visitMinutes,
  });

  it("takes nothing when the first stop alone overruns", () => {
    const chosen = fitStopsToBudget({
      hotelLocation: HOTEL,
      candidates: [stop(FAR, 180, "far-long")],
      budgetMinutes: 60,
      maxStops: 8,
    });

    assert.deepEqual(chosen, []);
  });

  it("keeps the ranked order of what it takes", () => {
    const chosen = fitStopsToBudget({
      hotelLocation: HOTEL,
      candidates: [stop(NEAR, 20, "first"), stop(NEAR, 20, "second"), stop(NEAR, 20, "third")],
      budgetMinutes: 240,
      maxStops: 8,
    });

    assert.deepEqual(chosen.map((c) => c.id), ["first", "second", "third"]);
  });

  it("skips a stop that does not fit but still takes a later one that does", () => {
    const chosen = fitStopsToBudget({
      hotelLocation: HOTEL,
      candidates: [stop(NEAR, 30, "fits"), stop(FAR, 200, "too-long"), stop(NEAR, 15, "also-fits")],
      budgetMinutes: 90,
      maxStops: 8,
    });

    assert.deepEqual(chosen.map((c) => c.id), ["fits", "also-fits"]);
  });

  it("never exceeds the maximum number of stops, however much time is left", () => {
    const candidates = Array.from({ length: 12 }, (_, index) => stop(NEAR, 1, `stop-${index}`));
    const chosen = fitStopsToBudget({ hotelLocation: HOTEL, candidates, budgetMinutes: 240, maxStops: 4 });

    assert.equal(chosen.length, 4);
  });

  it("takes nothing when the plan is allowed no stops at all", () => {
    const chosen = fitStopsToBudget({
      hotelLocation: HOTEL,
      candidates: [stop(NEAR, 5, "any")],
      budgetMinutes: 240,
      maxStops: 0,
    });

    assert.deepEqual(chosen, []);
  });

  it("fits more into a longer window — the guest's answer actually changes the day", () => {
    const candidates = Array.from({ length: 8 }, (_, index) => stop(NEAR, 25, `stop-${index}`));

    const shortDay = fitStopsToBudget({ hotelLocation: HOTEL, candidates, budgetMinutes: 60, maxStops: 8 });
    const longDay = fitStopsToBudget({ hotelLocation: HOTEL, candidates, budgetMinutes: 240, maxStops: 8 });

    assert.ok(longDay.length > shortDay.length);
  });
});

describe("checking a real routed plan", () => {
  it("accepts a plan that fits once walking and visiting are added up", () => {
    assert.equal(fitsInBudget({ routeSeconds: 1800, visitMinutes: 60, budgetMinutes: 120 }), true);
  });

  it("accepts a plan that fills the window exactly — the boundary is inclusive", () => {
    assert.equal(fitsInBudget({ routeSeconds: 3600, visitMinutes: 60, budgetMinutes: 120 }), true);
  });

  it("refuses a plan that overruns by any amount", () => {
    assert.equal(fitsInBudget({ routeSeconds: 3660, visitMinutes: 60, budgetMinutes: 120 }), false);
  });

  it("counts the visits, not just the walking", () => {
    // Half an hour of walking fits easily; three hours of visits do not.
    assert.equal(fitsInBudget({ routeSeconds: 1800, visitMinutes: 180, budgetMinutes: 120 }), false);
  });

  it("reports the total a guest should expect", () => {
    assert.equal(totalPlanMinutes({ routeSeconds: 1800, visitMinutes: 45 }), 75);
  });
});

describe("how much of the window is left", () => {
  const generatedAt = new Date("2026-03-10T12:00:00Z");

  it("is the whole window the moment a plan is generated", () => {
    assert.equal(
      remainingBudgetMinutes({ availableMinutes: 120, generatedAt, now: generatedAt }),
      120
    );
  });

  it("shrinks as the guest spends their afternoon", () => {
    const ninetyMinutesLater = new Date(generatedAt.getTime() + 90 * 60_000);
    assert.equal(
      remainingBudgetMinutes({ availableMinutes: 120, generatedAt, now: ninetyMinutesLater }),
      30
    );
  });

  it("is exactly zero the moment the window runs out", () => {
    const exactlyAtEnd = new Date(generatedAt.getTime() + 120 * 60_000);
    assert.equal(
      remainingBudgetMinutes({ availableMinutes: 120, generatedAt, now: exactlyAtEnd }),
      0
    );
  });

  it("never goes negative once the window has passed", () => {
    const longAfter = new Date(generatedAt.getTime() + 300 * 60_000);
    assert.equal(
      remainingBudgetMinutes({ availableMinutes: 120, generatedAt, now: longAfter }),
      0,
      "a spent window leaves nothing, not a negative budget that reads as room"
    );
  });

  it("is null when the plan never had a window, which is not the same as zero", () => {
    assert.equal(
      remainingBudgetMinutes({ availableMinutes: null, generatedAt, now: generatedAt }),
      null
    );
  });

  it("does not inflate the budget when the clock runs backwards", () => {
    const before = new Date(generatedAt.getTime() - 60 * 60_000);
    assert.equal(
      remainingBudgetMinutes({ availableMinutes: 120, generatedAt, now: before }),
      120,
      "skew must not hand the guest more time than they asked for"
    );
  });
});

describe("telling the guest how their time stands", () => {
  it("reports the time left and what the plan needs as two separate facts", () => {
    const summary = summarisePlanTime({ routeSeconds: 1800, pendingVisitMinutes: 40, remainingMinutes: 100 });

    assert.equal(summary.remainingMinutes, 100);
    assert.equal(summary.plannedMinutes, 70, "30 minutes of walking plus 40 of visits");
    assert.equal(summary.fitsRemaining, true);
    assert.equal(summary.overBudgetByMinutes, null);
  });

  it("flags a plan that no longer fits, and says by how much", () => {
    const summary = summarisePlanTime({ routeSeconds: 1800, pendingVisitMinutes: 60, remainingMinutes: 45 });

    assert.equal(summary.fitsRemaining, false);
    assert.equal(summary.plannedMinutes, 90);
    assert.equal(summary.overBudgetByMinutes, 45);
  });

  it("treats an exact fit as fitting", () => {
    const summary = summarisePlanTime({ routeSeconds: 1800, pendingVisitMinutes: 30, remainingMinutes: 60 });

    assert.equal(summary.fitsRemaining, true);
    assert.equal(summary.overBudgetByMinutes, null, "zero over budget must read as 'fits', not as a shortfall");
  });

  it("counts only the visits still to come", () => {
    const withPending = summarisePlanTime({ routeSeconds: 600, pendingVisitMinutes: 50, remainingMinutes: 120 });
    const allDone = summarisePlanTime({ routeSeconds: 600, pendingVisitMinutes: 0, remainingMinutes: 120 });

    assert.equal(withPending.plannedMinutes - allDone.plannedMinutes, 50);
  });

  it("withholds a verdict when the plan never had a window, rather than guessing one", () => {
    const summary = summarisePlanTime({ routeSeconds: 3600, pendingVisitMinutes: 120, remainingMinutes: null });

    assert.equal(summary.remainingMinutes, null);
    assert.equal(summary.fitsRemaining, null, "null is 'no window to judge against', never 'does not fit'");
    assert.equal(summary.overBudgetByMinutes, null);
    assert.equal(summary.plannedMinutes, 180, "the plan's own demand is still reported");
  });

  it("copes with a plan that has no route yet", () => {
    const summary = summarisePlanTime({ routeSeconds: null, pendingVisitMinutes: 30, remainingMinutes: 60 });

    assert.equal(summary.plannedMinutes, 30);
    assert.equal(summary.fitsRemaining, true);
  });

  it("reports an overrun with no time left at all", () => {
    const summary = summarisePlanTime({ routeSeconds: 1200, pendingVisitMinutes: 20, remainingMinutes: 0 });

    assert.equal(summary.remainingMinutes, 0);
    assert.equal(summary.fitsRemaining, false);
    assert.equal(summary.overBudgetByMinutes, 40);
  });
});
