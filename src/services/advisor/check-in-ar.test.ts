import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ItineraryDay, ItineraryStop } from "@/db/schema";
import { checkInStopWithAr, type ArCheckInDependencies } from "./check-in-ar";
import { HASH_BITS, HASH_HEX_LENGTH, AR_MATCH_THRESHOLD } from "@/services/ar/hash";
import { createVisitRecorder, loadAllAvailable } from "./test-utils";

/**
 * What an AR check-in must refuse, and what it must never write while refusing.
 *
 * The shape of almost every test here is the same: arrange a single thing wrong,
 * assert the refusal, then assert `writes` and the recorder are both EMPTY. A
 * refusal that still wrote a visit would hand out a permanent achievement for a
 * check-in the server rejected, and that is the failure worth guarding against.
 */

const PLACE_ID = "00000000-0000-4000-8000-0000000000aa";
const STOP_ID = "00000000-0000-4000-8000-0000000000b1";
const CLOCK = new Date("2026-03-10T10:00:00Z");

/** The reference hash stored for the Place, and a capture of the same subject. */
const TARGET = "5".repeat(HASH_HEX_LENGTH);
/** A photograph of something else entirely. */
const UNRELATED = "a".repeat(HASH_HEX_LENGTH);

/** Flips `count` bits, to stand for a slightly different photo of the same thing. */
function perturb(hash: string, count: number): string {
  const nibbles = hash.split("").map((char) => Number.parseInt(char, 16));
  for (let index = 0; index < nibbles.length && index < count; index += 1) nibbles[index] ^= 0b0001;
  return nibbles.map((value) => value.toString(16)).join("");
}

const AT_THE_STOP = {
  latitude: 41.7151,
  longitude: 44.8271,
  accuracyMeters: 10,
  capturedAtMs: CLOCK.getTime(),
};

function makeDay(overrides: Partial<ItineraryDay> = {}): ItineraryDay {
  return {
    id: "day-1",
    userId: "user-1",
    principalId: null,
    hotelId: "hotel-1",
    hotelStayId: "stay-1",
    dayNumber: 1,
    stopCount: 1,
    routeGeoJson: null,
    totalDurationSeconds: null,
    originalDurationSeconds: null,
    availableMinutes: null,
    generatedAt: new Date("2026-03-10T08:00:00Z"),
    completedAt: null,
    ...overrides,
  };
}

function makeStop(overrides: Partial<ItineraryStop> = {}): ItineraryStop {
  return {
    id: STOP_ID,
    dayId: "day-1",
    placeId: PLACE_ID,
    isHotelStop: false,
    checkInMethod: "gps",
    name: "Narikala Fortress",
    category: "landmark",
    latitude: AT_THE_STOP.latitude,
    longitude: AT_THE_STOP.longitude,
    imageUrl: null,
    visitDurationMinutes: null,
    position: 1,
    visitedAt: null,
    supersededAt: null,
    supersededReason: null,
    ...overrides,
  };
}

/**
 * Dependencies that record every side effect, so "wrote nothing" is assertable
 * rather than assumed.
 */
function makeDeps(
  options: {
    stops?: ItineraryStop[];
    day?: ItineraryDay;
    target?: string | null;
    markReturnsNull?: boolean;
  } = {}
) {
  const stops = options.stops ?? [makeStop()];
  const day = options.day ?? makeDay();
  const writes: string[] = [];
  const targetReads: string[] = [];
  const recorder = createVisitRecorder();

  const deps: ArCheckInDependencies = {
    findItineraryStopWithDay: async (stopId) => {
      const stop = stops.find((candidate) => candidate.id === stopId);
      return stop ? { stop, day } : null;
    },
    listItineraryStops: async () => stops,
    findArTargetHash: async (placeId) => {
      targetReads.push(placeId);
      return options.target === undefined ? TARGET : options.target;
    },
    markStopVisited: async (stopId) => {
      writes.push(stopId);
      if (options.markReturnsNull) return null;
      const stop = stops.find((candidate) => candidate.id === stopId)!;
      return { stop: { ...stop, visitedAt: CLOCK }, dayCompleted: true };
    },
    recordVerifiedVisit: recorder.record,
    loadAvailabilityContext: loadAllAvailable,
  };

  return { deps, writes, targetReads, recorder, stops, day };
}

/** The happy path, with one field overridden per test. */
function attempt(overrides: Partial<Parameters<typeof checkInStopWithAr>[0]> = {}) {
  return { userId: "user-1", stopId: STOP_ID, captureHash: TARGET, ...AT_THE_STOP, ...overrides };
}

describe("a genuine AR check-in", () => {
  it("completes the stop and records the visit as 'ar'", async () => {
    const { deps, writes, recorder } = makeDeps();

    const result = await checkInStopWithAr(attempt(), deps, CLOCK);

    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.alreadyVisited, false);
    assert.deepEqual(writes, [STOP_ID]);
    assert.deepEqual(recorder.calls, [{ userId: "user-1", placeId: PLACE_ID, method: "ar" }]);
  });

  it("accepts a capture that differs but stays inside the threshold", async () => {
    const { deps, writes } = makeDeps();
    const slightlyDifferentPhoto = perturb(TARGET, Math.floor(AR_MATCH_THRESHOLD * HASH_BITS));

    const result = await checkInStopWithAr(attempt({ captureHash: slightlyDifferentPhoto }), deps, CLOCK);

    assert.equal(result.ok, true, "a different phone on a different day must still work");
    assert.deepEqual(writes, [STOP_ID]);
  });

  it("never returns the stored target hash in any field of the result", async () => {
    const { deps } = makeDeps();

    const result = await checkInStopWithAr(attempt(), deps, CLOCK);

    // Serialising the whole result is the strongest form of this check: it catches
    // the hash appearing anywhere, including somewhere added later by accident.
    assert.equal(JSON.stringify(result).includes(TARGET), false);
  });
});

describe("the camera match itself", () => {
  it("refuses an unrelated photo, and writes nothing", async () => {
    const { deps, writes, recorder } = makeDeps();

    const result = await checkInStopWithAr(attempt({ captureHash: UNRELATED }), deps, CLOCK);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "no_match");
    assert.deepEqual(writes, []);
    assert.deepEqual(recorder.calls, []);
  });

  it("refuses a capture past the threshold", async () => {
    const { deps, writes } = makeDeps();
    const tooDifferent = perturb(TARGET, Math.ceil(AR_MATCH_THRESHOLD * HASH_BITS) + 1);

    const result = await checkInStopWithAr(attempt({ captureHash: tooDifferent }), deps, CLOCK);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "no_match");
    assert.deepEqual(writes, []);
  });

  it("refuses malformed capture hashes rather than treating them as a match", async () => {
    // "A".repeat(60) is spelled out rather than TARGET.toUpperCase(): if TARGET
    // happens to contain no letters, uppercasing it is a no-op and the case would
    // silently test nothing.
    for (const malformed of ["", "zzz", TARGET.slice(0, 59), "A".repeat(60), `${TARGET}0`]) {
      const { deps, writes } = makeDeps();

      const result = await checkInStopWithAr(attempt({ captureHash: malformed }), deps, CLOCK);

      assert.equal(result.ok, false, `${malformed.slice(0, 12)} must be refused`);
      assert.deepEqual(writes, [], "a malformed hash must never reach the write");
    }
  });

  it("never tells the guest how close they got", async () => {
    const { deps } = makeDeps();
    const nearMiss = perturb(TARGET, Math.ceil(AR_MATCH_THRESHOLD * HASH_BITS) + 1);

    const result = await checkInStopWithAr(attempt({ captureHash: nearMiss }), deps, CLOCK);
    const unrelated = await checkInStopWithAr(attempt({ captureHash: UNRELATED }), makeDeps().deps, CLOCK);

    // A near miss and a completely wrong photo are indistinguishable. Otherwise a
    // client could search towards a match without ever being at the Place.
    assert.deepEqual(
      result.ok === false && result.message,
      unrelated.ok === false && unrelated.message
    );
    assert.equal(JSON.stringify(result).includes("distance"), false);
  });

  it("refuses when the Place has no stored target", async () => {
    const { deps, writes } = makeDeps({ target: null });

    const result = await checkInStopWithAr(attempt(), deps, CLOCK);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "no_target");
    assert.deepEqual(writes, []);
  });

  it("refuses a featureless legacy target even if it matches the submitted frame", async () => {
    const { deps, writes, recorder } = makeDeps({ target: "0".repeat(60) });

    const result = await checkInStopWithAr(attempt({ captureHash: "0".repeat(60) }), deps, CLOCK);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "no_match");
    assert.deepEqual(writes, []);
    assert.deepEqual(recorder.calls, []);
  });
});

describe("the camera match is never enough on its own", () => {
  it("refuses a perfect match from the other side of the city", async () => {
    const { deps, writes, recorder } = makeDeps();

    // Rustaveli, several kilometres from the stop, with a flawless photo.
    const result = await checkInStopWithAr(
      attempt({ latitude: 41.6977, longitude: 44.8015 }),
      deps,
      CLOCK
    );

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "out_of_range");
    assert.deepEqual(writes, [], "a photo of a photo must not complete a stop");
    assert.deepEqual(recorder.calls, []);
  });

  it("refuses a perfect match with an unusably imprecise fix", async () => {
    const { deps, writes } = makeDeps();

    const result = await checkInStopWithAr(attempt({ accuracyMeters: 5000 }), deps, CLOCK);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "unreliable_position");
    assert.deepEqual(writes, []);
  });

  it("refuses a perfect match with a stale reading", async () => {
    const { deps, writes } = makeDeps();

    const result = await checkInStopWithAr(
      attempt({ capturedAtMs: CLOCK.getTime() - 10 * 60 * 1000 }),
      deps,
      CLOCK
    );

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "unreliable_position");
    assert.deepEqual(writes, []);
  });

  it("refuses a perfect match with a reading from the future", async () => {
    const { deps, writes } = makeDeps();

    const result = await checkInStopWithAr(
      attempt({ capturedAtMs: CLOCK.getTime() + 60 * 1000 }),
      deps,
      CLOCK
    );

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "unreliable_position");
    assert.deepEqual(writes, []);
  });

  it("checks position BEFORE reading the stored target at all", async () => {
    const { deps, targetReads } = makeDeps();

    await checkInStopWithAr(attempt({ latitude: 41.6977, longitude: 44.8015 }), deps, CLOCK);

    // Not merely tidy: a caller who is nowhere near the Place should not be able
    // to make the server fetch its target, however indirectly.
    assert.deepEqual(targetReads, []);
  });
});

describe("AR is not a way around the stop's saved method", () => {
  it("refuses a QR stop outright, however good the photo", async () => {
    const { deps, writes, recorder } = makeDeps({ stops: [makeStop({ checkInMethod: "qr" })] });

    const result = await checkInStopWithAr(attempt(), deps, CLOCK);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "wrong_check_in_method");
    assert.deepEqual(writes, [], "a partner's QR requirement must survive AR existing");
    assert.deepEqual(recorder.calls, []);
  });

  it("refuses the QR stop even standing exactly on it with a perfect match", async () => {
    const { deps, writes } = makeDeps({ stops: [makeStop({ checkInMethod: "qr" })] });
    const stop = makeStop();

    const result = await checkInStopWithAr(
      attempt({ latitude: stop.latitude, longitude: stop.longitude, accuracyMeters: 1 }),
      deps,
      CLOCK
    );

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "wrong_check_in_method");
    assert.deepEqual(writes, []);
  });

  it("completes a stop that explicitly requires AR", async () => {
    const { deps, writes } = makeDeps({ stops: [makeStop({ checkInMethod: "ar" })] });

    const result = await checkInStopWithAr(attempt(), deps, CLOCK);

    assert.equal(result.ok, true);
    assert.deepEqual(writes, [STOP_ID]);
  });
});

describe("ownership and eligibility are re-decided on the server", () => {
  it("refuses another guest's stop, and says only that it was not found", async () => {
    const { deps, writes, recorder } = makeDeps({ day: makeDay({ userId: "somebody-else" }) });

    const result = await checkInStopWithAr(attempt(), deps, CLOCK);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "not_found");
    // Same answer as a stop that does not exist: a prober learns nothing about
    // whether the id is real.
    assert.equal(result.ok === false && result.message, "Stop not found.");
    assert.deepEqual(writes, []);
    assert.deepEqual(recorder.calls, []);
  });

  it("refuses an unknown stop id", async () => {
    const { deps, writes } = makeDeps();

    const result = await checkInStopWithAr(
      attempt({ stopId: "00000000-0000-4000-8000-00000000ffff" }),
      deps,
      CLOCK
    );

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "not_found");
    assert.deepEqual(writes, []);
  });

  it("refuses a Place that is no longer eligible through the guest's hotel", async () => {
    const { deps: base, writes } = makeDeps();
    const deps: ArCheckInDependencies = {
      ...base,
      loadAvailabilityContext: async () => ({
        stay: { id: "stay-1", hotelId: "hotel-1", dayNumber: 1 },
        // The partnership ended; the camera still matches the building perfectly.
        eligiblePlaceIds: new Set<string>(),
      }),
    };

    const result = await checkInStopWithAr(attempt(), deps, CLOCK);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "stop_unavailable");
    assert.deepEqual(writes, []);
  });

  it("refuses a stop from a different day of the stay", async () => {
    const { deps, writes } = makeDeps({ day: makeDay({ dayNumber: 3 }) });

    const result = await checkInStopWithAr(attempt(), deps, CLOCK);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "wrong_day");
    assert.deepEqual(writes, []);
  });

  it("refuses to skip ahead past an earlier unvisited stop", async () => {
    const earlier = makeStop({ id: "stop-earlier", position: 1 });
    const later = makeStop({ id: STOP_ID, position: 2 });
    const { deps, writes } = makeDeps({ stops: [earlier, later] });

    const result = await checkInStopWithAr(attempt(), deps, CLOCK);

    assert.equal(result.ok, false);
    assert.equal(result.ok === false && result.reason, "stop_not_next");
    assert.deepEqual(writes, []);
  });
});

describe("doing it twice", () => {
  it("reports an already-visited stop as success without writing again", async () => {
    const { deps, writes, recorder } = makeDeps({ stops: [makeStop({ visitedAt: CLOCK })] });

    const result = await checkInStopWithAr(attempt(), deps, CLOCK);

    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.alreadyVisited, true);
    assert.deepEqual(writes, [], "a second capture must not write a second visit");
    assert.deepEqual(recorder.calls, [], "and must not unlock a second achievement");
  });

  it("does not even look at the photo for an already-visited stop", async () => {
    const { deps, targetReads } = makeDeps({ stops: [makeStop({ visitedAt: CLOCK })] });

    const result = await checkInStopWithAr(attempt({ captureHash: UNRELATED }), deps, CLOCK);

    // Already done is already done; a wrong photo cannot turn a completed stop
    // into a failure, and no comparison needs to happen.
    assert.equal(result.ok, true);
    assert.deepEqual(targetReads, []);
  });

  it("reports a lost race as an idempotent success, not an error", async () => {
    const { deps, recorder } = makeDeps({ markReturnsNull: true });

    const result = await checkInStopWithAr(attempt(), deps, CLOCK);

    assert.equal(result.ok, true);
    assert.equal(result.ok === true && result.alreadyVisited, true);
    // The write that won the race recorded the visit; this one must not record a second.
    assert.deepEqual(recorder.calls, []);
  });
});
