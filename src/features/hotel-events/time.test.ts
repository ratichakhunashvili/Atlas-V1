import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatTbilisiDateTime, parseTbilisiDateTime } from "./time";

describe("hotel event times are Tbilisi time, whatever the server's zone", () => {
  it("reads a datetime-local value as Tbilisi wall-clock time", () => {
    assert.equal(parseTbilisiDateTime("2026-11-20T18:00")?.toISOString(), "2026-11-20T14:00:00.000Z");
  });

  it("shows a stored instant as the same Tbilisi wall-clock time it was typed as", () => {
    const stored = parseTbilisiDateTime("2026-11-20T18:00");
    assert.ok(stored);
    assert.equal(formatTbilisiDateTime(stored), "2026-11-20 18:00");
  });

  it("rejects anything that isn't a datetime-local value", () => {
    assert.equal(parseTbilisiDateTime(""), null);
    assert.equal(parseTbilisiDateTime("tomorrow at six"), null);
    assert.equal(parseTbilisiDateTime("2026-11-20T18:00Z"), null);
  });
});
