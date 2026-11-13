import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSecurityHeaders } from "./security-headers";

const value = (rule: { headers: { key: string; value: string }[] }, key: string) =>
  rule.headers.find((h) => h.key === key)?.value;

test("every route group gets the five security headers", () => {
  const rules = buildSecurityHeaders({ isDev: false });
  assert.equal(rules.length, 3);
  for (const rule of rules) {
    for (const key of [
      "Content-Security-Policy",
      "X-Frame-Options",
      "Referrer-Policy",
      "X-Content-Type-Options",
      "Permissions-Policy",
    ]) {
      assert.ok(value(rule, key), `${rule.source} missing ${key}`);
    }
    assert.equal(value(rule, "Referrer-Policy"), "strict-origin-when-cross-origin");
    assert.equal(value(rule, "X-Content-Type-Options"), "nosniff");
    assert.match(value(rule, "Permissions-Policy")!, /geolocation=\(self\)/);
    assert.match(value(rule, "Permissions-Policy")!, /camera=\(self\)/);
  }
});

test("admin and API are never framed; guest routes may be framed by this site only (/present)", () => {
  const [admin, api, guest] = buildSecurityHeaders({ isDev: false });
  for (const rule of [admin, api]) {
    assert.equal(value(rule, "X-Frame-Options"), "DENY");
    assert.match(value(rule, "Content-Security-Policy")!, /frame-ancestors 'none'/);
  }
  assert.equal(value(guest, "X-Frame-Options"), "SAMEORIGIN");
  assert.match(value(guest, "Content-Security-Policy")!, /frame-ancestors 'self'/);
  const guestSource = new RegExp(`^${guest.source}$`);
  assert.ok(guestSource.test("/present") && guestSource.test("/") && guestSource.test("/login"));
  assert.ok(!guestSource.test("/admin") && !guestSource.test("/admin/hotels") && !guestSource.test("/api/x"));
});

test("the policy allows what the map, models and sign-in need, and nothing broader for scripts", () => {
  const csp = value(buildSecurityHeaders({ isDev: false })[2], "Content-Security-Policy")!;
  for (const part of [
    "https://api.mapbox.com",
    "https://events.mapbox.com",
    "https://*.tiles.mapbox.com",
    "https://*.vercel-storage.com",
    "worker-src 'self' blob:",
    "'wasm-unsafe-eval'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://accounts.google.com",
  ]) {
    assert.ok(csp.includes(part), `CSP lacks ${part}`);
  }
  const script = csp.split("; ").find((d) => d.startsWith("script-src"))!;
  assert.ok(!script.includes("https:") && !script.includes("*"));
  assert.ok(!script.includes("'unsafe-eval'"), "production must not allow unsafe-eval");
  const dev = value(buildSecurityHeaders({ isDev: true })[2], "Content-Security-Policy")!;
  assert.ok(dev.includes("'unsafe-eval'") && dev.includes("ws:"));
});

test("next.config turns off x-powered-by and serves these headers", () => {
  const config = readFileSync(join(process.cwd(), "next.config.ts"), "utf8");
  assert.match(config, /poweredByHeader:\s*false/);
  assert.match(config, /buildSecurityHeaders/);
});
