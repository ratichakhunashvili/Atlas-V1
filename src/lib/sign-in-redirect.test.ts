import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isSessionCookieName, signInRedirectPath } from "./sign-in-redirect";

const base = { isServerAction: true, referer: "http://localhost:3010/preferences?day=1", host: "localhost:3010", hadSessionCookie: true, ended: false };

describe("signInRedirectPath", () => {
  it("returns a form submitted after the session ended to its page, with the session-ended reason", () => {
    assert.equal(signInRedirectPath(base), "/login?callbackUrl=%2Fpreferences%3Fday%3D1&reason=session-ended");
  });

  it("marks a revoked session as ended even without its cookie name being recognised", () => {
    assert.equal(signInRedirectPath({ ...base, hadSessionCookie: false, ended: true }), "/login?callbackUrl=%2Fpreferences%3Fday%3D1&reason=session-ended");
  });

  it("never trusts a cross-site or unsafe Referer", () => {
    assert.equal(signInRedirectPath({ ...base, referer: "https://evil.example/preferences" }), "/login?reason=session-ended");
    assert.equal(signInRedirectPath({ ...base, referer: "http://localhost:3010//evil.example" }), "/login?reason=session-ended");
    assert.equal(signInRedirectPath({ ...base, referer: "not a url" }), "/login?reason=session-ended");
  });

  it("uses the Referer only for server actions; pages are redirected by the proxy, which knows the real path", () => {
    assert.equal(signInRedirectPath({ ...base, isServerAction: false }), "/login?reason=session-ended");
  });

  it("is plain /login for someone who never had a session", () => {
    assert.equal(signInRedirectPath({ isServerAction: false, referer: null, host: null, hadSessionCookie: false, ended: false }), "/login");
  });
});

describe("isSessionCookieName", () => {
  it("recognises the Auth.js session cookie in all its forms, and nothing else", () => {
    for (const name of ["authjs.session-token", "__Secure-authjs.session-token", "authjs.session-token.0"]) assert.ok(isSessionCookieName(name), name);
    for (const name of ["authjs.callback-url", "authjs.csrf-token", "session-token"]) assert.ok(!isSessionCookieName(name), name);
  });
});
