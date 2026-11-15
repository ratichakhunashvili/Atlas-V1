import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { QR_COLORS, brandedQrLayout, brandedQrSvg } from "./branded-qr";

const LINKS = [
  "https://atlas-v11-roan.vercel.app/checkin/abc",
  "https://atlas-v11-roan.vercel.app/checkin/" + "x".repeat(43),
  "https://atlas-v11-roan.vercel.app/unlock/" + "y".repeat(43),
];

describe("brandedQrSvg", () => {
  it("draws the Atlas colours and the star", () => {
    const svg = brandedQrSvg(LINKS[0]);
    assert.match(svg, /^<svg[^>]+viewBox="0 0 \d+ \d+"/);
    assert.ok(svg.includes(`fill="${QR_COLORS.paper}"`), "warm white background");
    assert.ok(svg.includes(`fill="${QR_COLORS.ink}"`), "teal modules");
    assert.ok(svg.includes(`fill="${QR_COLORS.star}"`), "bronze star");
  });

  it("is the same picture for the same link", () => {
    assert.equal(brandedQrSvg(LINKS[1]), brandedQrSvg(LINKS[1]));
    assert.notEqual(brandedQrSvg(LINKS[1]), brandedQrSvg(LINKS[2]));
  });

  it("uses error correction Q and clears well under what it can recover", () => {
    for (const link of LINKS) {
      const { size, hole, errorCorrection } = brandedQrLayout(link);
      assert.equal(errorCorrection.bit, 3, "level Q");
      assert.ok((hole * hole) / (size * size) < 0.1, `cleared ${hole}x${hole} of ${size}x${size}`);
      assert.equal(hole % 2, size % 2, "the cleared square sits exactly in the middle");
    }
  });
});
