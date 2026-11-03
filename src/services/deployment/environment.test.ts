import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideTestEntry,
  developmentToolsBlocked,
  parseDeploymentEnv,
  parseTestAccountAllowlist,
} from "./environment";

const fixtures = { "guest@atlas.test": "hotel-a-fixture" };
const base = {
  deploymentEnvRaw: "local",
  accountEmail: "guest@atlas.test",
  allowlistRaw: "guest@atlas.test",
  fixtures,
};

test("parseDeploymentEnv accepts known values and rejects everything else", () => {
  assert.equal(parseDeploymentEnv(" QA "), "qa");
  assert.equal(parseDeploymentEnv("production"), "production");
  for (const bad of [undefined, null, "", "prod", "stagingg", "test"]) {
    assert.equal(parseDeploymentEnv(bad), null, String(bad));
  }
});

test("test entry is allowed in local, development, qa and staging for an allowlisted, mapped account", () => {
  for (const env of ["local", "development", "qa", "staging"]) {
    assert.deepEqual(decideTestEntry({ ...base, deploymentEnvRaw: env }), { allowed: true, hotelId: "hotel-a-fixture" });
  }
});

test("test entry fails closed when the environment is production, missing or unknown", () => {
  for (const env of ["production", undefined, "", "prod", "Production1"]) {
    assert.deepEqual(decideTestEntry({ ...base, deploymentEnvRaw: env }), {
      allowed: false,
      reason: "environment_not_allowed",
    });
  }
});

test("a test-labelled but non-allowlisted account is refused", () => {
  assert.deepEqual(decideTestEntry({ ...base, allowlistRaw: "" }), { allowed: false, reason: "account_not_allowlisted" });
  assert.deepEqual(decideTestEntry({ ...base, allowlistRaw: undefined }), {
    allowed: false,
    reason: "account_not_allowlisted",
  });
  assert.deepEqual(decideTestEntry({ ...base, accountEmail: "someone-test@atlas.test" }), {
    allowed: false,
    reason: "account_not_allowlisted",
  });
});

test("an allowlisted account with no fixture mapping is refused, and prototype keys never match", () => {
  assert.deepEqual(
    decideTestEntry({ ...base, accountEmail: "other@atlas.test", allowlistRaw: "other@atlas.test" }),
    { allowed: false, reason: "no_fixture_for_account" }
  );
  assert.deepEqual(
    decideTestEntry({ ...base, accountEmail: "constructor", allowlistRaw: "constructor" }),
    { allowed: false, reason: "no_fixture_for_account" }
  );
});

test("allowlist parsing is case-insensitive and ignores blanks", () => {
  assert.deepEqual([...parseTestAccountAllowlist(" A@x.test, ,b@x.test ")], ["a@x.test", "b@x.test"]);
});

test("development tools are blocked in framework production mode and any declared non-local deployment", () => {
  assert.equal(developmentToolsBlocked("production", undefined), true);
  assert.equal(developmentToolsBlocked("production", "local"), true);
  assert.equal(developmentToolsBlocked("development", "staging"), true);
  assert.equal(developmentToolsBlocked("development", "qa"), true);
  assert.equal(developmentToolsBlocked("development", "production"), true);
  assert.equal(developmentToolsBlocked("development", "typo"), true);
  assert.equal(developmentToolsBlocked("development", undefined), false);
  assert.equal(developmentToolsBlocked("development", "local"), false);
  assert.equal(developmentToolsBlocked(undefined, "development"), false);
});
