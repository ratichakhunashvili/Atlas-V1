import assert from "node:assert/strict";
import { describe, it } from "node:test";
import QRCode from "qrcode";
import { extractQrToken } from "@/services/qr/extract";
import { generateRawQrToken } from "@/services/qr/token";
import { brandedQrLayout } from "./branded-qr";
import { qrLink } from "./qr-links";

const SITE = "https://atlas-v11-roan.vercel.app";

describe("qrLink", () => {
  it("prints short upper-case links: /C/ for a hotel, /U/ for a place", () => {
    assert.equal(qrLink(SITE, "hotel", "ABC234"), "HTTPS://ATLAS-V11-ROAN.VERCEL.APP/C/ABC234");
    assert.equal(qrLink(SITE + "/", "place", "XYZ567"), "HTTPS://ATLAS-V11-ROAN.VERCEL.APP/U/XYZ567");
  });

  it("round-trips through the in-app scanner to the same token", () => {
    const token = generateRawQrToken();
    assert.equal(extractQrToken(qrLink(SITE, "place", token)), token);
    assert.equal(extractQrToken(qrLink(SITE, "hotel", token)), token);
  });

  it("keeps a real printed code in QR alphanumeric mode, on the 33x33 grid", () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const link = qrLink(SITE, attempt % 2 ? "hotel" : "place", generateRawQrToken());
      const modes = QRCode.create(link, { errorCorrectionLevel: "Q" }).segments.map((segment) => segment.mode.id);
      assert.deepEqual(modes, ["Alphanumeric"]);
      assert.equal(brandedQrLayout(link).size, 33);
    }
  });
});
