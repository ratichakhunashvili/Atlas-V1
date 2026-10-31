import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLACE_CATEGORIES } from "@/db/schema";
import {
  CATEGORIES_WITHOUT_INTEREST,
  INTERESTS,
  budgetForPriceLabel,
  categoriesForInterests,
  interestsForCategories,
  minutesForTimeLabel,
} from "./interests";

describe("interest mapping", () => {
  it("reaches every place category except the hotel itself and the catch-all", () => {
    const reachable = new Set(categoriesForInterests([...INTERESTS]));
    for (const category of PLACE_CATEGORIES) {
      assert.equal(reachable.has(category), !CATEGORIES_WITHOUT_INTEREST.includes(category), category);
    }
  });

  it("round-trips: saved categories show the interests that produced them", () => {
    assert.deepEqual(interestsForCategories(categoriesForInterests(["Food", "Wellness"])), ["Food", "Wellness"]);
    assert.deepEqual(interestsForCategories([]), []);
  });

  it("reads a partially saved interest as picked", () => {
    assert.deepEqual(interestsForCategories(["landmark"]), ["History"]);
  });

  it("only accepts the offered time and price options", () => {
    assert.equal(minutesForTimeLabel("4 h+"), 240);
    assert.equal(minutesForTimeLabel("10 h"), undefined);
    assert.equal(budgetForPriceLabel("Any"), null);
    assert.equal(budgetForPriceLabel("Luxury"), "luxury");
    assert.equal(budgetForPriceLabel("free"), undefined);
  });
});
