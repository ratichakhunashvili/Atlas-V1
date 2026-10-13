import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { rankCandidates, type UsageHistory } from "./scoring";
import type { AdvisorCandidate } from "./candidates";
import { makeTestPlace } from "./test-utils";

function makeCandidate(overrides: {
  id: string;
  distanceMeters?: number;
  isPartner?: boolean;
  partnerPriority?: number | null;
}): AdvisorCandidate {
  return {
    place: makeTestPlace({ id: overrides.id, category: "restaurant" }),
    distanceMeters: overrides.distanceMeters ?? 100,
    isPartner: overrides.isPartner ?? false,
    partnerPriority: overrides.partnerPriority ?? null,
  };
}

const NO_HISTORY: UsageHistory = new Map();

describe("rankCandidates", () => {
  test("a never-used candidate beats a previously-used one", () => {
    const fresh = makeCandidate({ id: "fresh" });
    const used = makeCandidate({ id: "used" });
    const history: UsageHistory = new Map([["used", 3]]);

    const ranked = rankCandidates([used, fresh], history);
    assert.deepEqual(ranked.map((c) => c.place.id), ["fresh", "used"]);
  });

  test("older usage (lower dayNumber) beats newer usage", () => {
    const olderUse = makeCandidate({ id: "older" });
    const newerUse = makeCandidate({ id: "newer" });
    const history: UsageHistory = new Map([
      ["older", 2],
      ["newer", 5],
    ]);

    const ranked = rankCandidates([newerUse, olderUse], history);
    assert.deepEqual(ranked.map((c) => c.place.id), ["older", "newer"]);
  });

  test("equal freshness falls back to distance", () => {
    const near = makeCandidate({ id: "near", distanceMeters: 100 });
    const far = makeCandidate({ id: "far", distanceMeters: 900 });

    const ranked = rankCandidates([far, near], NO_HISTORY);
    assert.deepEqual(ranked.map((c) => c.place.id), ["near", "far"]);
  });

  test("a prioritized partner outranks a non-prioritized partner regardless of freshness/distance", () => {
    const prioritized = makeCandidate({ id: "prioritized", isPartner: true, partnerPriority: 5, distanceMeters: 4000 });
    const plain = makeCandidate({ id: "plain-partner", isPartner: true, partnerPriority: null, distanceMeters: 10 });

    const ranked = rankCandidates([plain, prioritized], NO_HISTORY);
    assert.deepEqual(ranked.map((c) => c.place.id), ["prioritized", "plain-partner"]);
  });

  test("lower priority number wins between two prioritized partners", () => {
    const first = makeCandidate({ id: "priority-1", isPartner: true, partnerPriority: 1 });
    const second = makeCandidate({ id: "priority-2", isPartner: true, partnerPriority: 2 });

    const ranked = rankCandidates([second, first], NO_HISTORY);
    assert.deepEqual(ranked.map((c) => c.place.id), ["priority-1", "priority-2"]);
  });

  test("two null-priority partners fall back to freshness/distance, unaffected by the priority feature existing", () => {
    const closer = makeCandidate({ id: "closer", isPartner: true, partnerPriority: null, distanceMeters: 50 });
    const fartherAway = makeCandidate({ id: "farther", isPartner: true, partnerPriority: null, distanceMeters: 4000 });

    const ranked = rankCandidates([fartherAway, closer], NO_HISTORY);
    assert.deepEqual(ranked.map((c) => c.place.id), ["closer", "farther"]);
  });

  test("priority only governs partner-vs-partner comparisons, not partner-vs-non-partner", () => {
    // A non-partner that is fresher/closer should still beat a partner with
    // no priority set — priority is not a blanket "partners always win."
    const partnerNoPriority = makeCandidate({ id: "partner", isPartner: true, partnerPriority: null, distanceMeters: 4000 });
    const nonPartner = makeCandidate({ id: "non-partner", isPartner: false, distanceMeters: 50 });

    const ranked = rankCandidates([partnerNoPriority, nonPartner], NO_HISTORY);
    assert.deepEqual(ranked.map((c) => c.place.id), ["non-partner", "partner"]);
  });

  test("ranking is deterministic across repeated calls with the same input", () => {
    const candidates = [
      makeCandidate({ id: "a", distanceMeters: 300 }),
      makeCandidate({ id: "b", distanceMeters: 100 }),
      makeCandidate({ id: "c", distanceMeters: 200 }),
    ];
    const history: UsageHistory = new Map([["a", 1]]);

    const first = rankCandidates(candidates, history).map((c) => c.place.id);
    const second = rankCandidates(candidates, history).map((c) => c.place.id);
    const third = rankCandidates(candidates, history).map((c) => c.place.id);

    assert.deepEqual(first, second);
    assert.deepEqual(second, third);
  });

  test("does not mutate the input array (no random ordering side effects)", () => {
    const candidates = [makeCandidate({ id: "a", distanceMeters: 300 }), makeCandidate({ id: "b", distanceMeters: 100 })];
    const originalOrder = candidates.map((c) => c.place.id);

    rankCandidates(candidates, NO_HISTORY);

    assert.deepEqual(candidates.map((c) => c.place.id), originalOrder);
  });

  test("partner guarantee preparation: the best partner is identifiable via filter + rank, without a second ranking function", () => {
    const bestPartner = makeCandidate({ id: "best-partner", isPartner: true, partnerPriority: 1 });
    const otherPartner = makeCandidate({ id: "other-partner", isPartner: true, partnerPriority: 2 });
    const nonPartner = makeCandidate({ id: "attraction", isPartner: false, distanceMeters: 1 });

    const rankedPartners = rankCandidates(
      [otherPartner, nonPartner, bestPartner].filter((c) => c.isPartner),
      NO_HISTORY
    );

    assert.equal(rankedPartners[0].place.id, "best-partner");
  });
});
