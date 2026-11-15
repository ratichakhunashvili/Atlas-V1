import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hotelTaskLimitSchema } from "./schema";

describe("hotel 'Tasks per day' validation (admin form)", () => {
  it("accepts 1 to 4, from the form's string value", () => {
    for (const value of ["1", "2", "3", "4", 4]) assert.equal(hotelTaskLimitSchema.safeParse({ dailyTaskLimit: value }).success, true, String(value));
    assert.equal(hotelTaskLimitSchema.parse({ dailyTaskLimit: "2" }).dailyTaskLimit, 2);
  });

  it("refuses anything else", () => {
    for (const value of ["0", "5", "-1", "2.5", "", "abc", null, undefined, "99"]) {
      assert.equal(hotelTaskLimitSchema.safeParse({ dailyTaskLimit: value }).success, false, String(value));
    }
  });
});
