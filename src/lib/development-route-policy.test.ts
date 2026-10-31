import { test } from "node:test";
import assert from "node:assert/strict";
import { isDevelopmentOnlyPath, shouldBlockDevelopmentOnlyPath } from "./development-route-policy";

test("development-only route matching includes exact paths and descendants, not similarly named routes", () => {
  for (const path of ["/dev", "/dev/advisor-check-in", "/dev/advisor-qr-check-in", "/demo", "/demo/hotel-a/time"]) {
    assert.equal(isDevelopmentOnlyPath(path), true, path);
  }

  for (const path of ["/developer", "/demo-preview", "/admin/advisor", "/"]) {
    assert.equal(isDevelopmentOnlyPath(path), false, path);
  }
});

test("development-only routes are blocked only in production", () => {
  assert.equal(shouldBlockDevelopmentOnlyPath("/dev/advisor-check-in", "production"), true);
  assert.equal(shouldBlockDevelopmentOnlyPath("/demo", "production"), true);
  assert.equal(shouldBlockDevelopmentOnlyPath("/dev/advisor-check-in", "development"), false);
  assert.equal(shouldBlockDevelopmentOnlyPath("/demo", "test"), false);
  assert.equal(shouldBlockDevelopmentOnlyPath("/admin", "production"), false);
});
