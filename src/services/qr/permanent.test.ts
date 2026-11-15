import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashQrToken, generateRawQrToken } from "./token";
import { derivePermanentQrToken, newPermanentQrCredential, qrCodeSecret, revealPermanentQrToken } from "./permanent";

const SECRET = "test-secret-that-is-long-enough-0123456789";

describe("permanent QR codes", () => {
  it("gives the same code for the same credential every time, so it can be downloaded again", () => {
    const { id, rawToken } = newPermanentQrCredential(SECRET);
    assert.equal(derivePermanentQrToken(SECRET, id), rawToken);
    assert.equal(revealPermanentQrToken(SECRET, { id, tokenHash: hashQrToken(rawToken) }), rawToken);
  });

  it("looks like every other Atlas code: 26 upper-case base32 characters", () => {
    assert.match(newPermanentQrCredential(SECRET).rawToken, /^[A-Z2-7]{26}$/);
  });

  it("differs per credential, so replacing a stolen code changes it", () => {
    assert.notEqual(newPermanentQrCredential(SECRET).rawToken, newPermanentQrCredential(SECRET).rawToken);
  });

  it("cannot be recalculated without the server's secret", () => {
    const { id, rawToken } = newPermanentQrCredential(SECRET);
    assert.notEqual(derivePermanentQrToken("another-secret-that-is-long-enough-012345", id), rawToken);
    assert.equal(revealPermanentQrToken("another-secret-that-is-long-enough-012345", { id, tokenHash: hashQrToken(rawToken) }), null);
  });

  it("recognises an older random code as one it cannot show again (it keeps working where printed)", () => {
    const printed = generateRawQrToken();
    assert.equal(revealPermanentQrToken(SECRET, { id: "11111111-1111-4111-8111-111111111111", tokenHash: hashQrToken(printed) }), null);
  });

  it("refuses a missing or short secret", () => {
    assert.equal(qrCodeSecret({}), null);
    assert.equal(qrCodeSecret({ QR_CODE_SECRET: "short" }), null);
    assert.equal(qrCodeSecret({ QR_CODE_SECRET: ` ${SECRET} ` }), SECRET);
  });
});
