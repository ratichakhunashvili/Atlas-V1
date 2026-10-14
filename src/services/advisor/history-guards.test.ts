import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Static guards for the check-in revalidation phase. The real SQL cannot be run in this environment
 * (no database integration tests yet), so these fail loudly if someone later weakens the rules that
 * protect itinerary history. They complement the behavioural tests; they do not replace them.
 */

const SRC = join(process.cwd(), "src");
const read = (path: string) => readFileSync(join(SRC, path), "utf8");

/** The text of one exported function: from its declaration to the next top-level `export`/EOF. */
function functionText(source: string, name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const next = source.indexOf("\nexport ", start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}

describe("db/queries/itinerary.ts: history is never deleted and completed stops are never superseded", () => {
  const queries = read("db/queries/itinerary.ts");

  test("itinerary_stops rows are never deleted by application code", () => {
    assert.doesNotMatch(queries, /\.delete\(\s*itineraryStops\s*\)/);
    assert.doesNotMatch(queries, /delete\s+from\s+itinerary_stops/i);
  });

  test("every UPDATE that supersedes a stop is guarded by visited_at IS NULL (completed stops can never match)", () => {
    const re = /supersededAt:\s*[^,}]+/g;
    let count = 0;
    for (const match of queries.matchAll(re)) {
      const around = queries.slice(match.index, match.index + 700);
      assert.match(around, /isNull\(itineraryStops\.visitedAt\)/, `supersede at offset ${match.index} must filter on visited_at IS NULL`);
      assert.match(around, /isNull\(itineraryStops\.supersededAt\)/, "and only act on still-active rows");
      count += 1;
    }
    assert.equal(count, 3, "exactly three supersede paths: full rebuild, replacement, explicit removal");
  });

  test("every ACTIVE read excludes superseded rows", () => {
    for (const name of ["listItineraryStops", "findItineraryStopWithDay", "markStopVisited", "getStopUsageHistory"]) {
      assert.match(functionText(queries, name), /isNull\(itineraryStops\.supersededAt\)/, `${name} must exclude superseded stops`);
    }
  });

  test("day completion ignores superseded rows (a superseded unvisited row must never keep a day open)", () => {
    const text = functionText(queries, "markStopVisited");
    assert.match(text, /remaining[\s\S]*isNull\(itineraryStops\.supersededAt\)/);
    assert.match(queries, /computeDayCompletedAt/);
  });

  test("a separate all-rows reader exists for history", () => {
    assert.match(queries, /export async function listAllItineraryStops\(/);
  });

  test("the full rebuild supersedes ONLY pending stops (it never touches visited ones) and appends new stops after every existing row", () => {
    const text = functionText(queries, "persistItinerary");
    assert.match(text, /plan_regenerated/);
    assert.match(text, /nextPositionTx/);
    assert.doesNotMatch(text, /\.delete\(/);
  });
});

describe("every guest action on a pending stop re-checks eligibility", () => {
  test("GPS and QR check-in evaluate availability early AND again as the last step before the write", () => {
    for (const file of ["services/advisor/check-in.ts", "services/advisor/check-in-qr.ts"]) {
      const text = read(file);
      const loads = [...text.matchAll(/loadAvailabilityContext\(/g)].map((m) => m.index!);
      assert.ok(loads.length >= 2, `${file}: availability must be loaded at least twice (decide, then re-check before the write)`);
      const write = text.indexOf("d.markStopVisited(");
      assert.ok(write > 0, `${file}: markStopVisited call found`);
      assert.ok(loads[loads.length - 1] < write, `${file}: the last availability load must come BEFORE the write`);
      assert.match(text, /stop_unavailable/);
    }
  });

  test("the default check-in dependencies include the real availability loader (it cannot be silently omitted)", () => {
    for (const file of ["services/advisor/check-in.ts", "services/advisor/check-in-qr.ts", "services/advisor/current-itinerary.ts"]) {
      assert.match(read(file), /loadAvailabilityContext:\s*loadDefaultAvailabilityContext/, file);
    }
  });

  test("directions to a stop go through the availability check", () => {
    assert.match(read("services/advisor/directions-to-stop.ts"), /evaluateStopAvailability/);
    const actions = read("features/advisor/actions.ts");
    assert.match(actions, /getDirectionsToStopForUser/);
    assert.doesNotMatch(actions, /getWalkingDirections/, "the action must not call the routing service directly");
  });

  test("ordinary Generate cannot reach plan repair (the exception lives only behind the explicit action)", () => {
    // Imports only (a comment may mention it): neither a static nor a dynamic import of plan-repair.
    assert.doesNotMatch(read("services/advisor/generate-itinerary.ts"), /(from|import\()\s*["'][^"']*plan-repair["']/);
    const actions = read("features/advisor/actions.ts");
    assert.match(actions, /export async function replaceUnavailableStopsAction\(\)/, "the replace action takes no client input at all");
    assert.match(actions, /replaceUnavailableStopsForUser\(user\.id\)/);
  });

  test("plan repair re-derives availability itself and refuses when nothing is unavailable", () => {
    const text = read("services/advisor/plan-repair.ts");
    assert.match(text, /nothing_to_regenerate/);
    assert.match(text, /evaluatePendingStops/);
    assert.match(text, /getWalkingRouteInOrder/);
    assert.doesNotMatch(text, /optimizeWalkingRoute/, "retained stops must keep their order: never the optimizer");
  });
});

describe("migration 0004 is additive and enforces 'completed stops are never superseded' in the database", () => {
  const dir = join(SRC, "db", "migrations");
  const name = readdirSync(dir).find((n) => n.startsWith("0004_") && n.endsWith(".sql"));
  const sql = name ? readFileSync(join(dir, name), "utf8") : "";

  test("it exists and only adds nullable columns and constraints", () => {
    assert.ok(name, "0004 migration present");
    assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN|CONSTRAINT)/i);
    assert.doesNotMatch(sql, /DELETE\s+FROM|TRUNCATE|\bUPDATE\b/i);
    assert.match(sql, /ADD COLUMN "superseded_at" timestamp with time zone;/);
    assert.match(sql, /ADD COLUMN "superseded_reason" text;/);
    assert.doesNotMatch(sql, /superseded_(at|reason)"[^;]*NOT NULL/);
  });

  test("a visited stop can never be superseded (CHECK), status and reason travel together, and reasons are a closed set", () => {
    assert.match(sql, /itinerary_stops_completed_never_superseded_check[\s\S]*"superseded_at" is null or [^;]*"visited_at" is null/);
    assert.match(sql, /itinerary_stops_superseded_pair_check/);
    assert.match(sql, /'stop_unavailable', 'plan_regenerated', 'removed_unavailable'/);
  });
});

describe("which day can be checked in: server-computed, never client-supplied", () => {
  test("GPS and QR check-in both verify the day with the shared rule, and refuse with wrong_day", () => {
    for (const file of ["services/advisor/check-in.ts", "services/advisor/check-in-qr.ts"]) {
      const text = read(file);
      assert.match(text, /evaluateDayCheckIn\(day, context\)/, `${file} must verify the day`);
      assert.match(text, /wrong_day/, `${file} must refuse with wrong_day`);
      // The day check happens BEFORE the write.
      assert.ok(text.indexOf("evaluateDayCheckIn(day, context)") < text.indexOf("d.markStopVisited("), `${file}: day check precedes the write`);
    }
  });

  test("the current day number is derived from the stay dates and the SERVER clock only", () => {
    const text = read("services/advisor/stop-availability.ts");
    assert.match(text, /calculateDayNumber\(stay\.checkIn, stay\.checkOut, now\)/);
    assert.match(text, /day\.dayNumber !== context\.stay\.dayNumber/);
  });

  test("no check-in or directions server action / schema accepts a date, day number, 'now', day id or stay id from the client", () => {
    const actions = read("features/advisor/actions.ts");
    const schema = read("features/advisor/schema.ts");
    for (const forbidden of [/\bdate\b/i, /dayNumber/, /\bnow\b/, /dayId/, /hotelStayId/, /stayId/, /hotelId/]) {
      assert.doesNotMatch(schema, forbidden, `schema must not accept ${forbidden}`);
    }
    // The action signatures take only the stop id / QR text / the guest's own coordinates.
    assert.match(actions, /export async function checkInGpsAction\(stopId: string, latitude: number, longitude: number\)/);
    assert.match(actions, /export async function checkInQrAction\(qrToken: string\)/);
    assert.match(actions, /export async function getDirectionsToStopAction\(\s*stopId: string,\s*latitude: number,\s*longitude: number\s*\)/);
    assert.match(actions, /export async function replaceUnavailableStopsAction\(\)/);
    assert.doesNotMatch(actions, /new Date\(\s*[a-zA-Z]/, "actions never build a date from client input");
  });

  test("directions and the read model use the same day rule (through the shared availability check)", () => {
    assert.match(read("services/advisor/directions-to-stop.ts"), /evaluateStopAvailability/);
    assert.match(read("services/advisor/current-itinerary.ts"), /evaluatePendingStops/);
  });
});

describe("displayed duration vs the original estimate", () => {
  const queries = read("db/queries/itinerary.ts");

  test("a repair (replacement or removal) updates the ACTIVE duration and never writes the original estimate", () => {
    for (const name of ["persistStopReplacement", "persistStopRemoval"]) {
      const text = functionText(queries, name);
      assert.match(text, /totalDurationSeconds: input\.totalDurationSeconds/, `${name} updates the active duration`);
      assert.doesNotMatch(text, /originalDurationSeconds/, `${name} must not touch the original estimate`);
    }
  });

  test("a NEW plan (new day or full rebuild) sets the original estimate", () => {
    const text = functionText(queries, "persistItinerary");
    assert.equal([...text.matchAll(/originalDurationSeconds: input\.totalDurationSeconds/g)].length, 2, "new day and full rebuild");
  });

  test("the difficulty system reads the ORIGINAL estimate (falling back to the total for older rows)", () => {
    assert.match(read("services/advisor/generate-itinerary.ts"), /previous\.originalDurationSeconds \?\? previous\.totalDurationSeconds/);
  });

  test("migration 0004 adds the original-duration column as nullable, with no data statements", () => {
    const dir = join(SRC, "db", "migrations");
    const name = readdirSync(dir).find((n) => n.startsWith("0004_") && n.endsWith(".sql"));
    const sql = readFileSync(join(dir, name!), "utf8");
    assert.match(sql, /ALTER TABLE "itinerary_days" ADD COLUMN "original_duration_seconds" integer;/);
    assert.doesNotMatch(sql, /\bUPDATE\b|DELETE\s+FROM|DROP\s+/i);
  });
});
