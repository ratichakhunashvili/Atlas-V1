import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getMailer, isRecoveryAvailable, trustedLinkOrigin } from "./index";
import { clearSessionCookies } from "@/lib/ended-session-response";
import { isBackgroundRequest, withoutSessionCookieRefresh } from "@/lib/session-redirect";

describe("the file outbox stays local", () => {
  it("is used only on local, development and qa deployments", () => {
    for (const env of ["local", "development", "qa"]) assert.ok(getMailer({ ATLAS_MAIL_OUTBOX_DIR: "/tmp/outbox", ATLAS_DEPLOYMENT_ENV: env }), env);
    for (const env of ["staging", "production", "", "prod"]) {
      assert.equal(getMailer({ ATLAS_MAIL_OUTBOX_DIR: "/tmp/outbox", ATLAS_DEPLOYMENT_ENV: env }), null, env || "(unset)");
    }
  });

  it("falls through to Resend on production even if an outbox directory is set", () => {
    assert.ok(getMailer({ ATLAS_MAIL_OUTBOX_DIR: "/tmp/outbox", ATLAS_DEPLOYMENT_ENV: "production", RESEND_API_KEY: "re_x", MAIL_FROM: "a@b.c" }));
  });
});

describe("recovery links use a trusted HTTPS origin", () => {
  it("takes the origin from AUTH_URL only, and requires https", () => {
    assert.equal(trustedLinkOrigin({ AUTH_URL: "https://atlas.example/some/path", ATLAS_DEPLOYMENT_ENV: "production" }), "https://atlas.example");
    assert.equal(trustedLinkOrigin({ AUTH_URL: "http://atlas.example", ATLAS_DEPLOYMENT_ENV: "production" }), null);
    assert.equal(trustedLinkOrigin({ ATLAS_DEPLOYMENT_ENV: "production" }), null, "no Host-header fallback");
    assert.equal(trustedLinkOrigin({ AUTH_URL: "not a url" }), null);
  });

  it("allows plain http only for localhost on local or qa", () => {
    assert.equal(trustedLinkOrigin({ AUTH_URL: "http://localhost:3010", ATLAS_DEPLOYMENT_ENV: "qa" }), "http://localhost:3010");
    assert.equal(trustedLinkOrigin({ AUTH_URL: "http://localhost:3010", ATLAS_DEPLOYMENT_ENV: "production" }), null);
    assert.equal(trustedLinkOrigin({ AUTH_URL: "http://evil.example", ATLAS_DEPLOYMENT_ENV: "local" }), null);
  });

  it("is available only with both mail and a trusted origin", () => {
    assert.equal(isRecoveryAvailable({ RESEND_API_KEY: "re_x", MAIL_FROM: "a@b.c" }), false, "no AUTH_URL");
    assert.equal(isRecoveryAvailable({ RESEND_API_KEY: "re_x", MAIL_FROM: "a@b.c", AUTH_URL: "https://atlas.example" }), true);
  });
});

describe("session cookies are cleared, never refreshed, for ended or background requests", () => {
  it("clears every session cookie the browser sent", () => {
    const cleared = clearSessionCookies(["authjs.session-token", "__Secure-authjs.session-token.0", "authjs.csrf-token"], true);
    assert.equal(cleared.length, 2);
    for (const cookie of cleared) assert.match(cookie, /=; Path=\/; Expires=Thu, 01 Jan 1970.*Max-Age=0.*HttpOnly.*Secure/);
  });

  it("recognises background navigation fetches", () => {
    assert.ok(isBackgroundRequest(new Headers({ rsc: "1" })));
    assert.ok(isBackgroundRequest(new Headers({ "next-router-prefetch": "1" })));
    assert.ok(isBackgroundRequest(new Headers({ "sec-fetch-dest": "empty" })), "a fetch");
    assert.ok(isBackgroundRequest(new Headers({ accept: "text/html" })), "no browser marker: not a page load");
    assert.ok(!isBackgroundRequest(new Headers({ "sec-fetch-dest": "document" })), "a page load");
  });

  it("strips only the session cookie refresh from a response", () => {
    const response = new Response(null, { headers: new Headers() });
    response.headers.append("set-cookie", "authjs.session-token=abc; Path=/; HttpOnly");
    response.headers.append("set-cookie", "other=1; Path=/");
    const out = withoutSessionCookieRefresh(response).headers.getSetCookie();
    assert.deepEqual(out, ["other=1; Path=/"]);
  });
});
