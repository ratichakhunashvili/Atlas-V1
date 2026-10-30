import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { badgeImageUrlSchema, createAchievementSchema, updateAchievementSchema } from "./schema";

const PLACE_ID = "11111111-1111-4111-8111-111111111111";

describe("badge image URLs", () => {
  it("accepts ordinary http and https links", () => {
    for (const url of ["https://cdn.example.com/badge.png", "http://example.org/b.svg"]) {
      assert.equal(badgeImageUrlSchema.safeParse(url).success, true, `${url} should be allowed`);
    }
  });

  it("treats blank as no badge image rather than an error", () => {
    const parsed = badgeImageUrlSchema.safeParse("");
    assert.equal(parsed.success, true);
    assert.equal(parsed.success && parsed.data, null);
  });

  it("refuses schemes that are not a hosted image", () => {
    // javascript: would execute if it ever reached an attribute; data: can carry a
    // payload; file: addresses the server's own disk.
    for (const url of [
      "javascript:alert(1)",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "file:///etc/passwd",
      "ftp://example.com/badge.png",
    ]) {
      assert.equal(badgeImageUrlSchema.safeParse(url).success, false, `${url} must be refused`);
    }
  });

  it("refuses text that is not a URL at all", () => {
    for (const value of ["not a url", "example.com/badge.png", "//example.com/b.png"]) {
      assert.equal(badgeImageUrlSchema.safeParse(value).success, false);
    }
  });

  it("refuses an absurdly long URL", () => {
    const long = `https://example.com/${"a".repeat(2100)}.png`;
    assert.equal(badgeImageUrlSchema.safeParse(long).success, false);
  });
});

describe("creating a badge", () => {
  const valid = {
    placeId: PLACE_ID,
    name: "Museum regular",
    description: "Visit the museum",
    badgeImageUrl: "https://cdn.example.com/badge.png",
  };

  it("accepts a well-formed badge", () => {
    assert.equal(createAchievementSchema.safeParse(valid).success, true);
  });

  it("requires a real Place id", () => {
    assert.equal(createAchievementSchema.safeParse({ ...valid, placeId: "not-a-uuid" }).success, false);
    assert.equal(createAchievementSchema.safeParse({ ...valid, placeId: "" }).success, false);
  });

  it("requires a name that is not just whitespace", () => {
    assert.equal(createAchievementSchema.safeParse({ ...valid, name: "   " }).success, false);
  });

  it("trims the name rather than storing padding", () => {
    const parsed = createAchievementSchema.safeParse({ ...valid, name: "  Spa day  " });
    assert.equal(parsed.success && parsed.data.name, "Spa day");
  });

  it("turns an empty description into null", () => {
    const parsed = createAchievementSchema.safeParse({ ...valid, description: "" });
    assert.equal(parsed.success && parsed.data.description, null);
  });

  it("refuses an over-long name or description", () => {
    assert.equal(createAchievementSchema.safeParse({ ...valid, name: "a".repeat(121) }).success, false);
    assert.equal(createAchievementSchema.safeParse({ ...valid, description: "a".repeat(1001) }).success, false);
  });
});

describe("editing a badge", () => {
  it("has no Place field: a badge cannot be moved to a different Place", () => {
    const parsed = updateAchievementSchema.safeParse({
      placeId: PLACE_ID,
      name: "Renamed",
      description: "",
      badgeImageUrl: "",
    });

    assert.equal(parsed.success, true);
    assert.equal("placeId" in (parsed.success ? parsed.data : {}), false, "moving it would rewrite what guests earned");
  });
});
