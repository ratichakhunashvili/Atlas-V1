import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RATE_LIMIT_SCOPES } from "@/db/schema";
import { RATE_LIMIT_RULES, isWithinLimit, rateLimitedMessage, windowStart } from "./policy";

const NOW = new Date("2026-03-10T12:00:00Z");

describe("the approved limits", () => {
  it("matches the agreed numbers exactly", () => {
    assert.deepEqual(RATE_LIMIT_RULES.place_check_in, { limit: 10, windowSeconds: 900, counts: "failures" });
    assert.deepEqual(RATE_LIMIT_RULES.hotel_entry, { limit: 5, windowSeconds: 900, counts: "failures" });
    assert.deepEqual(RATE_LIMIT_RULES.qr_credential_issue, { limit: 20, windowSeconds: 3600, counts: "all" });
  });

  it("covers every scope, so none can be throttled by an undefined rule", () => {
    for (const scope of RATE_LIMIT_SCOPES) {
      assert.ok(RATE_LIMIT_RULES[scope], `${scope} needs a rule`);
    }
  });

  it("charges a guest only for failures on the two guest-facing scopes", () => {
    assert.equal(RATE_LIMIT_RULES.place_check_in.counts, "failures");
    assert.equal(RATE_LIMIT_RULES.hotel_entry.counts, "failures");
  });

  it("charges every credential operation, so successful rotation is not a free loop", () => {
    assert.equal(RATE_LIMIT_RULES.qr_credential_issue.counts, "all");
  });
});

describe("the threshold", () => {
  it("permits attempts up to and including the limit", () => {
    assert.equal(isWithinLimit("hotel_entry", 0), true);
    assert.equal(isWithinLimit("hotel_entry", 4), true, "the 5th attempt still goes through");
  });

  it("refuses the one after the limit", () => {
    assert.equal(isWithinLimit("hotel_entry", 5), false, "the 6th does not");
  });

  it("stays refused above the limit, without escalating", () => {
    assert.equal(isWithinLimit("hotel_entry", 50), false);
  });

  it("applies each scope's own limit", () => {
    assert.equal(isWithinLimit("place_check_in", 9), true);
    assert.equal(isWithinLimit("place_check_in", 10), false);
    assert.equal(isWithinLimit("qr_credential_issue", 19), true);
    assert.equal(isWithinLimit("qr_credential_issue", 20), false);
  });
});

describe("the rolling window", () => {
  it("opens exactly one window-length before now", () => {
    assert.equal(windowStart("place_check_in", NOW).toISOString(), "2026-03-10T11:45:00.000Z");
    assert.equal(windowStart("qr_credential_issue", NOW).toISOString(), "2026-03-10T11:00:00.000Z");
  });

  it("moves with the clock rather than resetting on a boundary", () => {
    const later = new Date(NOW.getTime() + 60_000);
    assert.equal(
      windowStart("place_check_in", later).getTime() - windowStart("place_check_in", NOW).getTime(),
      60_000
    );
  });
});

describe("what a throttled actor is told", () => {
  it("says only that there were too many attempts", () => {
    const message = rateLimitedMessage();

    assert.match(message, /too many attempts/i);
    for (const leak of ["hotel", "code", "credential", "exists", "purpose", "stop"]) {
      assert.equal(message.toLowerCase().includes(leak), false, `the refusal must not mention ${leak}`);
    }
  });
});

describe("rate limiting stays inside the approved scopes", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("defines exactly the approved buckets", () => {
    // route_retry (a guest's redraw can cost a Mapbox request) and support_lookup (admin guest-stay lookup) were
    // added by the 2026-10-19 master prompt, which asks for sensitive and expensive operations to be throttled.
    assert.deepEqual(
      [...RATE_LIMIT_SCOPES],
      ["place_check_in", "hotel_entry", "qr_credential_issue", "route_retry", "support_lookup"]
    );
  });

  it("is applied only by the four approved operations", () => {
    // GPS and QR check-in share place_check_in; hotel entry and credential issue
    // have one each. Anything else calling the limiter is a scope expansion.
    const callers = [
      "src/features/advisor/actions.ts",
      "src/features/hotel-stays/actions.ts",
      "src/features/qr-credentials/actions.ts",
    ];

    for (const file of callers) {
      assert.match(read(file), /from "@\/db\/queries\/rate-limit"/, `${file} should apply a limit`);
    }
  });

  it("never throttles itinerary generation or plan repair", () => {
    const advisorActions = read("src/features/advisor/actions.ts");

    // Isolate the generation and repair actions and prove the limiter is absent.
    for (const name of ["generateItineraryAction", "replaceUnavailableStopsAction", "removeUnavailableStopAction"]) {
      const start = advisorActions.indexOf(`export async function ${name}`);
      assert.notEqual(start, -1, `${name} must exist`);
      const next = advisorActions.indexOf("export async function", start + 1);
      const body = advisorActions.slice(start, next === -1 ? undefined : next);
      assert.doesNotMatch(
        body,
        /checkAttemptAllowed|reserveAttempt/,
        `${name} must not be rate-limited: throttling a guest's own plan would degrade the product to protect nothing`
      );
    }
  });

  it("is not applied to the read-only scan landing", () => {
    const stays = read("src/features/hotel-stays/actions.ts");
    const start = stays.indexOf("export async function previewHotelEntryByToken");
    const body = stays.slice(start, stays.indexOf("export async function enterHotelByToken"));

    assert.doesNotMatch(body, /checkAttemptAllowed|reserveAttempt|recordFailedAttempt/);
  });
});
