import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertScenarioToolEnabled,
  createAdvisorTestScenario,
  createScenarioTag,
  isSafeScenarioTag,
  scenarioEmail,
  scenarioPlaceMarker,
  scenarioPreset,
  deleteAdvisorTestScenario,
  type DeleteScenarioDependencies,
  type ScenarioType,
} from "./scenario";
import { calculateNextStopCount, type PreviousDayOutcome } from "../advisor/difficulty";

test("createScenarioTag produces a safe, parseable tag for every scenario type", () => {
  const types: ScenarioType[] = ["A", "B", "C", "D", "E", "F"];
  const now = new Date("2026-03-10T12:00:00Z");
  for (const type of types) {
    const tag = createScenarioTag(type, now);
    assert.equal(tag, `advisor-test-${type.toLowerCase()}-${now.getTime()}`);
    assert.equal(isSafeScenarioTag(tag), true, `${tag} must be a safe tag`);
  }
});

test("isSafeScenarioTag rejects anything that could widen an ILIKE prefix match", () => {
  const unsafe = [
    "advisor-test-a-123%",
    "advisor-test-a-123_456",
    "advisor-test-a-",
    "advisor-test-z-123", // 'z' is not a real scenario type letter
    "advisor-test-a-12x3",
    "../../etc/passwd",
    "",
    "advisor-test-a-123; drop table places;",
  ];
  for (const tag of unsafe) {
    assert.equal(isSafeScenarioTag(tag), false, `expected "${tag}" to be rejected`);
  }
});

test("scenarioEmail and scenarioPlaceMarker embed the tag exactly, one-to-one", () => {
  const tag = "advisor-test-c-1700000000000";
  assert.equal(scenarioEmail(tag), `${tag}@atlas-advisor-test.invalid`);
  assert.equal(scenarioPlaceMarker(tag), `[${tag}]`);
});

test("scenarioPreset: Scenario C creates exactly one QR-enabled partner Place", () => {
  const preset = scenarioPreset("C");
  const partners = preset.places.filter((p) => p.eligibility === "partner");
  assert.equal(partners.length, 1);
  assert.equal(partners[0].hasQrToken, true);
});

test("scenarioPreset: Scenario E creates fewer Places than the Advisor's default target stop count (4)", () => {
  const preset = scenarioPreset("E");
  assert.ok(preset.places.length < 4, "Scenario E must under-supply candidates relative to MIN_STOPS");
});

test("scenarioPreset: Scenario F backdates check-in so a Day 2 generation is reachable immediately", () => {
  const preset = scenarioPreset("F");
  assert.equal(preset.checkInDaysAgo, 1);
});

test("scenarioPreset: Scenario D mixes QR-enabled and GPS-only Places", () => {
  const preset = scenarioPreset("D");
  const withQr = preset.places.filter((p) => p.hasQrToken).length;
  const withoutQr = preset.places.filter((p) => !p.hasQrToken).length;
  assert.ok(withQr >= 2, "expects at least 2 QR-enabled places");
  assert.ok(withoutQr >= 2, "expects at least 2 GPS-only places");
});

// Cross-checks the admin tool's history-seeding facts (see
// seedPreviousDayHistory's own doc comment) against the REAL difficulty
// service, so "what this seeds" and "what the ratchet actually reads" can
// never silently drift apart. Mirrors the exact math seedPreviousDayHistory
// uses, rather than re-deriving a second formula.
function seededOutcome(outcome: "easy" | "hard" | "incomplete", stopCount = 4): PreviousDayOutcome {
  const generatedAt = new Date("2026-03-10T08:00:00Z");
  const totalDurationSeconds = 7200;
  const completedAt =
    outcome === "incomplete"
      ? null
      : outcome === "easy"
        ? new Date(generatedAt.getTime() + totalDurationSeconds * 1000 * 0.25)
        : new Date(generatedAt.getTime() + totalDurationSeconds * 1000 * 0.75);
  return {
    stopCount,
    allStopsVisited: outcome !== "incomplete",
    completedAt,
    generatedAt,
    totalDurationSeconds,
  };
}

test("seeded 'easy' history makes the real difficulty service increase the next stop count", () => {
  assert.equal(calculateNextStopCount(seededOutcome("easy", 4)), 5);
});

test("seeded 'hard' (not-fast-enough) history keeps the real difficulty service's count the same", () => {
  assert.equal(calculateNextStopCount(seededOutcome("hard", 4)), 4);
});

test("seeded 'incomplete' history keeps the real difficulty service's count the same", () => {
  assert.equal(calculateNextStopCount(seededOutcome("incomplete", 4)), 4);
});

function createFakeDeleteDeps() {
  const calls: string[] = [];
  const users = new Map([["user-1", { id: "user-1" }]]);
  const stays = new Map([["user-1", { hotel: { id: "hotel-1" } }]]);
  const places = [{ id: "place-hotel" }, { id: "place-1" }, { id: "place-2" }];

  const deps: DeleteScenarioDependencies = {
    findUserByEmail: async (email) => (email === "advisor-test-a-123@atlas-advisor-test.invalid" ? users.get("user-1")! : null),
    findCurrentStayForUser: async (userId) => stays.get(userId) ?? null,
    listPlacesByNamePrefix: async () => places,
    deleteUser: async (id) => {
      calls.push(`deleteUser:${id}`);
    },
    deleteHotel: async (id) => {
      calls.push(`deleteHotel:${id}`);
    },
    deletePlace: async (id) => {
      calls.push(`deletePlace:${id}`);
    },
  };
  return { deps, calls };
}

test("deleteAdvisorTestScenario refuses to run against an unsafe tag, without calling any dependency", async () => {
  const { deps, calls } = createFakeDeleteDeps();
  const result = await deleteAdvisorTestScenario("advisor-test-a-123%", deps);
  assert.deepEqual(result, { deleted: false, reason: "unsafe_tag" });
  assert.deepEqual(calls, []);
});

test("deleteAdvisorTestScenario reports not_found for a well-formed but nonexistent scenario, without deleting anything", async () => {
  const { deps, calls } = createFakeDeleteDeps();
  const result = await deleteAdvisorTestScenario("advisor-test-b-999", deps);
  assert.deepEqual(result, { deleted: false, reason: "not_found" });
  assert.deepEqual(calls, []);
});

test("deleteAdvisorTestScenario deletes the user, THEN the hotel, THEN every Place — hotels.placeId is NOT NULL+restrict, so any other order would fail against the real DB", async () => {
  const { deps, calls } = createFakeDeleteDeps();
  const result = await deleteAdvisorTestScenario("advisor-test-a-123", deps);
  assert.deepEqual(result, { deleted: true });

  assert.equal(calls[0], "deleteUser:user-1");
  assert.equal(calls[1], "deleteHotel:hotel-1");
  const placeDeletes = calls.slice(2);
  assert.deepEqual(
    placeDeletes.sort(),
    ["deletePlace:place-1", "deletePlace:place-2", "deletePlace:place-hotel"].sort(),
    "every scenario Place, including the hotel's own Place, must be deleted"
  );
});

test("deleteAdvisorTestScenario still deletes the user and matched Places even if the hotel stay was already gone", async () => {
  const { deps, calls } = createFakeDeleteDeps();
  deps.findCurrentStayForUser = async () => null;
  const result = await deleteAdvisorTestScenario("advisor-test-a-123", deps);
  assert.deepEqual(result, { deleted: true });
  assert.equal(calls[0], "deleteUser:user-1");
  assert.ok(!calls.some((c) => c.startsWith("deleteHotel")), "no hotel to delete");
  assert.equal(calls.filter((c) => c.startsWith("deletePlace")).length, 3);
});

test("scenarioPreset: every scenario Place is a hotel-owned facility or a partner, except Scenario B's one explicit non-partner decoy", () => {
  for (const type of ["A", "B", "C", "D", "E", "F"] as const) {
    const preset = scenarioPreset(type);
    const decoys = preset.places.filter((p) => p.eligibility === "none");
    assert.equal(decoys.length, type === "B" ? 1 : 0, `scenario ${type}`);
  }
});

test("assertScenarioToolEnabled throws in production and allows development/test", () => {
  assert.throws(() => assertScenarioToolEnabled("production"), /disabled in production/);
  assert.doesNotThrow(() => assertScenarioToolEnabled("development"));
  assert.doesNotThrow(() => assertScenarioToolEnabled("test"));
  assert.doesNotThrow(() => assertScenarioToolEnabled(undefined));
});

test("createAdvisorTestScenario refuses to run in production before touching any database (it would create ACTIVE partnerships)", async () => {
  await assert.rejects(
    () => createAdvisorTestScenario("B", "user", { adminId: "admin-1", nodeEnv: "production" }),
    /disabled in production/
  );
});
