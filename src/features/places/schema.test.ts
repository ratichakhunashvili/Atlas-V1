import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizePhoneForTel } from "@/features/legal/front-desk";
import { placeSchema } from "./schema";

const base = {
  name: "QA place",
  description: "",
  latitude: "41.69",
  longitude: "44.80",
  category: "hotel",
  address: "",
  imageUrl: "",
  website: "",
  visitDurationMinutes: "",
  priceLevel: "",
  priceLevelSource: "",
};

describe("a place's phone number", () => {
  it("may be left empty", () => {
    for (const phone of ["", "   "]) {
      const parsed = placeSchema.safeParse({ ...base, phone });
      assert.equal(parsed.success, true, JSON.stringify(phone));
      assert.equal(parsed.success && parsed.data.phone, undefined);
    }
  });

  it("accepts a number the guest call link can dial, stored as typed (trimmed)", () => {
    for (const phone of ["+995 555 000 085", "(032) 200-0000", "+995.32.200.0000", " 322000000 "]) {
      const parsed = placeSchema.safeParse({ ...base, phone });
      assert.equal(parsed.success, true, phone);
      assert.equal(parsed.success && parsed.data.phone, phone.trim());
      assert.notEqual(normalizePhoneForTel(phone), null, "the same rule as the front-desk link");
    }
  });

  it("refuses text the call link could not dial, with a clear message", () => {
    for (const phone of ["call me maybe", "+995 555 000 085 ext 2", "++995555000085", "12345", "1234567890123456"]) {
      const parsed = placeSchema.safeParse({ ...base, phone });
      assert.equal(parsed.success, false, phone);
      assert.match(parsed.success ? "" : (parsed.error.issues[0]?.message ?? ""), /phone number/i);
      assert.equal(normalizePhoneForTel(phone), null, "agrees with the front-desk link");
    }
  });
});

describe("how guests check in at a place", () => {
  it("defaults to both when the form leaves it out", () => {
    const parsed = placeSchema.safeParse({ ...base, phone: "" });
    assert.equal(parsed.success && parsed.data.checkInMethod, "qr_or_gps");
  });

  it("accepts QR only, location only and both", () => {
    for (const checkInMethod of ["qr", "gps", "qr_or_gps"]) {
      const parsed = placeSchema.safeParse({ ...base, phone: "", checkInMethod });
      assert.equal(parsed.success && parsed.data.checkInMethod, checkInMethod);
    }
  });

  it("refuses any other value, including stop-only methods", () => {
    for (const checkInMethod of ["ar", "auto", "QR", "", "anything"]) {
      assert.equal(placeSchema.safeParse({ ...base, phone: "", checkInMethod }).success, false, checkInMethod);
    }
  });
});
