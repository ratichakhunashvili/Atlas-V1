import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseDayProgramForm, placesOutsideCatalogue, validateDayProgram } from "./day-program";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const form = (fields: Record<string, string>) => (name: string) => fields[name] ?? null;

describe("day program validation", () => {
  it("accepts 1-3 places per step and up to 4 steps, numbered 1..n", () => {
    const result = validateDayProgram([[id(1), id(2), id(3)], [id(4)], [id(5)], [id(6), id(7)]]);
    assert.deepEqual(result, {
      ok: true,
      steps: [
        { position: 1, placeIds: [id(1), id(2), id(3)] },
        { position: 2, placeIds: [id(4)] },
        { position: 3, placeIds: [id(5)] },
        { position: 4, placeIds: [id(6), id(7)] },
      ],
    });
  });

  it("an empty program is valid (back to the normal plan)", () => {
    assert.deepEqual(validateDayProgram([]), { ok: true, steps: [] });
  });

  it("refuses an empty step, more than 3 places, more than 4 steps, a non-id and a place twice", () => {
    assert.equal(validateDayProgram([[]]).ok, false);
    assert.equal(validateDayProgram([[id(1), id(2), id(3), id(4)]]).ok, false);
    assert.equal(validateDayProgram([[id(1)], [id(2)], [id(3)], [id(4)], [id(5)]]).ok, false);
    assert.equal(validateDayProgram([["not-a-uuid"]]).ok, false);
    const twiceInStep = validateDayProgram([[id(1), id(1)]]);
    assert.deepEqual(twiceInStep, { ok: false, error: "A place can appear only once in the day program" });
    assert.equal(validateDayProgram([[id(1)], [id(2), id(1)]]).ok, false, "twice across steps");
  });

  it("reads the form: empty rows are removed, the order numbers reorder the steps", () => {
    const result = parseDayProgramForm(
      form({
        step0_order: "2",
        step0_place0: id(1),
        step1_order: "1",
        step1_place0: "",
        step1_place1: id(2),
        step1_place2: id(3),
        step2_order: "3",
        step3_order: "4",
        step3_place0: id(4),
      })
    );
    assert.deepEqual(result, {
      ok: true,
      steps: [
        { position: 1, placeIds: [id(2), id(3)] },
        { position: 2, placeIds: [id(1)] },
        { position: 3, placeIds: [id(4)] },
      ],
    });
    assert.deepEqual(parseDayProgramForm(form({})), { ok: true, steps: [] });
  });

  it("lists places outside the hotel's eligible catalogue", () => {
    const steps = [{ position: 1, placeIds: [id(1), id(2)] }];
    assert.deepEqual(placesOutsideCatalogue(steps, new Set([id(1)])), [id(2)]);
    assert.deepEqual(placesOutsideCatalogue(steps, new Set([id(1), id(2)])), []);
  });
});
