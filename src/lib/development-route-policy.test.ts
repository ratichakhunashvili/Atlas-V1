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

test("design-review screens with invented data are blocked in production, live screens are not", () => {
  const preview = ["/place/partner-1", "/list", "/guide", "/map/next-stop", "/route/partner-4", "/unlocked", "/unlocked/attraction-1",
    "/ar-unlock", "/stay/confirmed", "/plan/added-spa", "/plan/repair/confirm", "/scan/wrong-code", "/achievements/achievement-3", "/states"];
  for (const path of preview) assert.equal(shouldBlockDevelopmentOnlyPath(path, "production"), true, path);

  const live = ["/", "/places/a71a5000-0000-4000-8000-000000001001", "/plan", "/plan/unlocked", "/scan", "/scan-hotel",
    "/directions", "/unlock/abc", "/profile", "/profile/permissions", "/achievements", "/welcome", "/privacy",
    "/terms", "/forgot-password", "/reset-password", "/account-deleted", "/preferences", "/login", "/signup"];
  for (const path of live) assert.equal(shouldBlockDevelopmentOnlyPath(path, "production"), false, path);
});

test("the proxy matcher runs on every blocked prefix (otherwise the block never happens)", async () => {
  const { readFile } = await import("node:fs/promises");
  const { DESIGN_PREVIEW_PREFIXES } = await import("./development-route-policy");
  const proxy = await readFile(new URL("../proxy.ts", import.meta.url), "utf8");
  for (const prefix of DESIGN_PREVIEW_PREFIXES) {
    const top = `/${prefix.split("/")[1]}`;
    const covered = [`"${top}/:path*"`, `"${top}/:path+"`].some((entry) => proxy.includes(entry));
    assert.ok(covered, `proxy matcher misses ${prefix}`);
  }
});
