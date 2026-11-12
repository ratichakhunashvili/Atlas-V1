import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adminRedirect } from "./admin-route-policy";

const admin = { role: "admin" };
const guest = { role: "user" };

describe("adminRedirect", () => {
  it("leaves non-admin paths alone", () => {
    assert.equal(adminRedirect("/", null), null);
    assert.equal(adminRedirect("/administrator", null), null, "only the /admin segment, not a prefix match");
  });

  it("sends a signed-out visitor to admin sign-in, remembering where they were going", () => {
    assert.equal(adminRedirect("/admin", null), "/admin/sign-in?callbackUrl=%2Fadmin");
    assert.equal(adminRedirect("/admin/places/new", null), "/admin/sign-in?callbackUrl=%2Fadmin%2Fplaces%2Fnew");
  });

  it("sends a signed-in guest to Access denied", () => {
    assert.equal(adminRedirect("/admin", guest), "/admin/denied");
    assert.equal(adminRedirect("/admin/hotels", guest), "/admin/denied");
    assert.equal(adminRedirect("/admin/hotels", {}), "/admin/denied", "a token with no role is not an admin");
  });

  it("lets an admin through", () => {
    assert.equal(adminRedirect("/admin", admin), null);
    assert.equal(adminRedirect("/admin/places", admin), null);
  });

  it("keeps sign-in and Access denied reachable without a session, and never loops", () => {
    assert.equal(adminRedirect("/admin/sign-in", null), null);
    assert.equal(adminRedirect("/admin/sign-in", guest), null);
    assert.equal(adminRedirect("/admin/denied", null), null);
    assert.equal(adminRedirect("/admin/denied", guest), null);
  });

  it("takes an admin who is already signed in past the sign-in form", () => {
    assert.equal(adminRedirect("/admin/sign-in", admin), "/admin");
    assert.equal(adminRedirect("/admin/sign-in", admin, { search: "?callbackUrl=%2Fadmin%2Fstaff" }), "/admin");
  });

  it("does not loop a token whose session the server ended between sign-in and the console", () => {
    // requireAdmin sends such a token to /admin/sign-in?reason=session-ended; the token still says admin.
    assert.equal(adminRedirect("/admin/sign-in", admin, { search: "?reason=session-ended" }), null);
    assert.equal(adminRedirect("/admin/sign-in", admin, { search: "?callbackUrl=%2Fadmin&reason=session-ended" }), null);
  });

  it("keeps the query string in the callback and marks an ended session", () => {
    assert.equal(adminRedirect("/admin/analytics", null, { search: "?days=7" }), "/admin/sign-in?callbackUrl=%2Fadmin%2Fanalytics%3Fdays%3D7");
    assert.equal(
      adminRedirect("/admin", null, { sessionEnded: true }),
      "/admin/sign-in?callbackUrl=%2Fadmin&reason=session-ended"
    );
    assert.equal(adminRedirect("/admin", guest, { sessionEnded: true }), "/admin/denied", "only a missing session can have ended");
  });
});
