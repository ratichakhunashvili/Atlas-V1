import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { finishedCopy } from "./finished-copy";

describe("the plan's 'nothing more today' message", () => {
  it("never says the day is done, or that everything is done, when nothing was done (0 of 4)", () => {
    for (const reason of ["nothing_left", "no_time"] as const) {
      const copy = finishedCopy(reason, 0);
      assert.doesNotMatch(`${copy.title} ${copy.text}`, /day is done|done everything/i, reason);
      assert.match(copy.title, /nothing fits/i, reason);
      assert.equal(copy.offerPreferences, true, `${reason}: invites the guest to change their interests`);
    }
  });

  it("says the day is done once something was done", () => {
    assert.equal(finishedCopy("nothing_left", 1).title, "Your day is done");
    assert.match(finishedCopy("nothing_left", 2).text, /done everything that fits your interests/);
    assert.equal(finishedCopy("no_time", 3).title, "Your day is done");
    assert.equal(finishedCopy("limit", 4).title, "Your day is done");
  });

  it("never mentions contracts, commission or approval", () => {
    for (const reason of ["limit", "no_time", "nothing_left"] as const) {
      for (const done of [0, 1, 4]) {
        const copy = finishedCopy(reason, done);
        assert.doesNotMatch(`${copy.title} ${copy.text}`, /contract|commission|approv/i);
      }
    }
  });
});
