import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PLACE_CATEGORIES, type PlaceCategory } from "@/db/schema";
import { categoryGroupOf, groupsUsedBy, onePerGroup } from "./category-groups";

const place = (name: string, category: PlaceCategory | null) => ({ name, category });
const names = (items: { name: string }[]) => items.map((item) => item.name);

describe("one place per category group per day", () => {
  it("puts every category in a group, and similar categories in the same one", () => {
    for (const category of PLACE_CATEGORIES) assert.ok(categoryGroupOf(category), category);
    assert.equal(categoryGroupOf("restaurant"), categoryGroupOf("nightlife"));
    assert.equal(categoryGroupOf("historical"), categoryGroupOf("museum"));
    assert.equal(categoryGroupOf("landmark"), categoryGroupOf("historical"));
    assert.notEqual(categoryGroupOf("winery"), categoryGroupOf("restaurant"), "a tasting is not a second meal");
  });

  it("never offers two food places, keeping the better-ranked one", () => {
    const ranked = [place("Best restaurant", "restaurant"), place("Second restaurant", "restaurant"), place("Church", "historical"), place("Bar", "nightlife")];
    assert.deepEqual(names(onePerGroup(ranked, (item) => item.category)), ["Best restaurant", "Church"]);
  });

  it("skips groups the day already has, and stops at the limit", () => {
    const ranked = [place("Museum", "museum"), place("Park", "nature"), place("Winery", "winery"), place("Spa", "spa")];
    const used = groupsUsedBy([{ category: "historical" }, { category: null }]);
    assert.deepEqual(names(onePerGroup(ranked, (item) => item.category, { used, limit: 2 })), ["Park", "Winery"]);
  });

  it("gives fewer options rather than repeating a group", () => {
    const ranked = [place("Cafe", "restaurant"), place("Restaurant", "restaurant"), place("Bar", "nightlife")];
    assert.deepEqual(names(onePerGroup(ranked, (item) => item.category, { limit: 3 })), ["Cafe"]);
  });
});
