import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { isTestEntryEnvironment, parseDeploymentEnv } from "@/services/deployment/environment";

/*
 * One plan per day of a stay (owner decision, 2026-11-13). The database enforces it with the unique
 * (user_id, hotel_stay_id, day_number) key; a concurrent start gets "already_started" (services/advisor/daily-plan.ts,
 * db/queries/itinerary.ts createEmptyItineraryDay). The only way to start a day again is the test-only "Start today
 * again", and these tests pin that it can never run on production or on a deployment that does not say what it is.
 */

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("one plan per day", () => {
  it("the test-only restart is never allowed on production or an undeclared deployment", () => {
    for (const raw of ["production", "Production", " production ", "", undefined, null, "prod", "live"]) {
      assert.equal(isTestEntryEnvironment(parseDeploymentEnv(raw)), false, String(raw));
    }
    for (const raw of ["local", "development", "qa", "staging"]) assert.equal(isTestEntryEnvironment(parseDeploymentEnv(raw)), true, raw);
  });

  it("the restart action checks the gate on the server before touching the plan", () => {
    const actions = read("src/features/plan/actions.ts");
    const body = actions.slice(actions.indexOf("export async function restartTodayAction"));
    const end = body.indexOf("\n}\n");
    const action = body.slice(0, end);
    assert.ok(action.indexOf("isTestFinishAllowed(user.id)") > 0, "gate present");
    assert.ok(action.indexOf("isTestFinishAllowed(user.id)") < action.indexOf("restartTodayForTesting("), "gate before the restart");
  });

  it("the gate fails closed: no deployment setting, or an account missing from the allowlist, means no", () => {
    const gate = read("src/features/plan/test-finish.ts");
    assert.match(gate, /if \(!isTestEntryEnvironment\(parseDeploymentEnv\(process\.env\.ATLAS_DEPLOYMENT_ENV\)\)\) return false;/);
    assert.match(gate, /parseTestAccountAllowlist\(process\.env\.ATLAS_TEST_ENTRY_ACCOUNTS\)\.has\(email\)/);
  });

  it("a second start of the same day is refused, including when two requests race", () => {
    const start = read("src/services/advisor/daily-plan.ts");
    assert.match(start, /if \(await d\.findItineraryDay\(userId, stay\.hotel\.id, dayNumber, stay\.id\)\) return \{ ok: false, reason: "already_started" \};/);
    assert.match(start, /return day \? \{ ok: true \} : \{ ok: false, reason: "already_started" \};/);
    const insert = read("src/db/queries/itinerary.ts");
    const create = insert.slice(insert.indexOf("export async function createEmptyItineraryDay"));
    assert.match(create.slice(0, create.indexOf("\n}\n")), /if \(isUniqueViolation\(error\)\) return null;/);
  });
});

describe("the old whole-day generator", () => {
  it("refuses outside development, so a direct server-action call cannot add a plan or skip feedback", () => {
    const actions = readFileSync("src/features/advisor/actions.ts", "utf8").replace(/\r\n/g, "\n");
    const body = actions.slice(actions.indexOf("export async function generateItineraryAction"));
    const action = body.slice(0, body.indexOf("\n}\n"));
    assert.ok(action.indexOf("developmentToolsBlocked(process.env.NODE_ENV, process.env.ATLAS_DEPLOYMENT_ENV)") > 0);
    assert.ok(action.indexOf("developmentToolsBlocked(") < action.indexOf("generateItineraryForUser("));
  });
});
