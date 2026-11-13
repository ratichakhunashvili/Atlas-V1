import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { shouldBlockDevelopmentOnlyPath } from "./development-route-policy";
import {
  GUEST_PROTECTED_EXACT,
  GUEST_PROTECTED_PREFIXES,
  hasSessionCookie,
  isGuestProtectedPath,
  proxyReadsSession,
  sessionRedirect,
} from "./session-redirect";

const admin = { role: "admin" };
const guest = { role: "user" };
const signedOut = (pathname: string, search = "", sessionCookie = false) =>
  sessionRedirect({ pathname, search, viewer: null, sessionCookie });

describe("which requests the proxy hands to Auth.js", () => {
  it("only page loads: a server-action POST never gets a re-issued session cookie", () => {
    assert.equal(proxyReadsSession("GET"), true);
    assert.equal(proxyReadsSession("HEAD"), true);
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) assert.equal(proxyReadsSession(method), false, method);
  });

  it("proxy.ts blocks development routes first, then lets non-page-loads through before Auth.js runs", () => {
    const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
    const body = proxy.slice(proxy.indexOf("export default async function proxy"));
    const block = body.indexOf("shouldBlockDevelopmentOnlyPath(");
    const gate = body.indexOf("if (!proxyReadsSession(req.method)) return NextResponse.next();");
    const authCall = body.indexOf("pageLoadProxy");
    assert.ok(block >= 0 && gate > block && authCall > gate, "order: dev block, method gate, then Auth.js");
    assert.doesNotMatch(proxy, /export default auth\(/, "the Auth.js wrapper must not see every request");
  });
});

describe("guest sign-in redirects", () => {
  it("keeps the path and its query string in the callback", () => {
    assert.equal(signedOut("/preferences", "?step=2"), "/login?callbackUrl=%2Fpreferences%3Fstep%3D2");
    assert.equal(signedOut("/places/abc"), "/login?callbackUrl=%2Fplaces%2Fabc");
    assert.equal(signedOut("/"), "/login?callbackUrl=%2F");
  });

  it("says the session ended when a session cookie came without a session", () => {
    assert.equal(signedOut("/plan", "", true), "/login?callbackUrl=%2Fplan&reason=session-ended");
    assert.equal(signedOut("/plan", "", false), "/login?callbackUrl=%2Fplan");
  });

  it("protects the live guest screens that used to redirect to a bare /login", () => {
    for (const path of ["/preferences", "/preferences/edit", "/plan", "/plan/unlocked", "/scan", "/directions", "/places/a71a5000-0000-4000-8000-000000001001", "/achievements", "/privacy/delete-account", "/profile", "/checkin/abc", "/unlock/abc"]) {
      assert.equal(isGuestProtectedPath(path), true, path);
      assert.ok(signedOut(path)?.startsWith("/login?callbackUrl="), path);
    }
  });

  it("leaves public screens and design previews alone", () => {
    for (const path of ["/login", "/signup", "/scan-hotel", "/privacy", "/terms", "/welcome", "/forgot-password", "/plan/ready", "/scan/wrong-code", "/achievements/achievement-1", "/place/partner-1", "/preferencesx"]) {
      assert.equal(isGuestProtectedPath(path), false, path);
      assert.equal(signedOut(path), null, path);
    }
  });

  it("lets a signed-in guest through", () => {
    assert.equal(sessionRedirect({ pathname: "/plan", search: "", viewer: guest, sessionCookie: true }), null);
  });

  it("a blocked design preview stays a 404 in production: the block runs before any protection", () => {
    for (const path of ["/plan/ready", "/scan/wrong-code", "/achievements/achievement-3"]) {
      assert.equal(shouldBlockDevelopmentOnlyPath(path, "production"), true, path);
    }
    for (const path of ["/plan", "/plan/unlocked", "/scan", "/achievements", "/places/x", "/directions", "/preferences"]) {
      assert.equal(shouldBlockDevelopmentOnlyPath(path, "production"), false, path);
    }
  });

  it("the proxy matcher runs on every protected guest path", () => {
    const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
    for (const exact of GUEST_PROTECTED_EXACT) {
      const top = `/${exact.split("/")[1]}`;
      const covered = [`"${exact}"`, `"${top}/:path*"`, ...(exact === top ? [] : [`"${top}/:path+"`])].some((entry) => proxy.includes(entry));
      assert.ok(covered, `proxy matcher misses ${exact}`);
    }
    for (const prefix of GUEST_PROTECTED_PREFIXES) assert.ok(proxy.includes(`"${prefix}/:path*"`), `proxy matcher misses ${prefix}`);
  });
});

describe("admin redirects through the proxy", () => {
  it("keeps the query string of an admin deep link (CAND-02)", () => {
    assert.equal(signedOut("/admin/analytics", "?days=7"), "/admin/sign-in?callbackUrl=%2Fadmin%2Fanalytics%3Fdays%3D7");
  });

  it("says the session ended on admin sign-in too", () => {
    assert.equal(signedOut("/admin/staff", "", true), "/admin/sign-in?callbackUrl=%2Fadmin%2Fstaff&reason=session-ended");
  });

  it("sends a guest to Access denied and lets an admin through", () => {
    assert.equal(sessionRedirect({ pathname: "/admin", search: "", viewer: guest, sessionCookie: true }), "/admin/denied");
    assert.equal(sessionRedirect({ pathname: "/admin", search: "", viewer: admin, sessionCookie: true }), null);
  });
});

describe("session cookie detection", () => {
  it("recognises the Auth.js session cookie, secure or not, whole or chunked", () => {
    assert.equal(hasSessionCookie(["authjs.session-token"]), true);
    assert.equal(hasSessionCookie(["__Secure-authjs.session-token"]), true);
    assert.equal(hasSessionCookie(["authjs.session-token.0", "authjs.session-token.1"]), true);
    assert.equal(hasSessionCookie(["authjs.csrf-token", "authjs.callback-url", "theme"]), false);
    assert.equal(hasSessionCookie(["xauthjs.session-token"]), false);
    assert.equal(hasSessionCookie([]), false);
  });
});
