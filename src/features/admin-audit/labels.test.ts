import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ADMIN_AUDIT_ACTIONS } from "@/db/schema/admin-audit-events";
import { AUDIT_ACTION_LABELS, auditActionLabel } from "./labels";

describe("audit log labels", () => {
  it("every audited action has a readable label, and no label exists for an unknown action", () => {
    for (const action of ADMIN_AUDIT_ACTIONS) {
      const label = auditActionLabel(action);
      assert.notEqual(label, action, action);
      assert.ok(label.length > 0);
    }
    assert.deepEqual(Object.keys(AUDIT_ACTION_LABELS).sort(), [...ADMIN_AUDIT_ACTIONS].sort());
  });

  it("labels the hotel, facility and place-edit actions", () => {
    assert.equal(auditActionLabel("hotel.created"), "Hotel created");
    assert.equal(auditActionLabel("hotel.updated"), "Hotel's place changed");
    assert.equal(auditActionLabel("facility.added"), "Hotel facility added");
    assert.equal(auditActionLabel("facility.deactivated"), "Hotel facility deactivated");
    assert.equal(auditActionLabel("facility.reactivated"), "Hotel facility activated");
    assert.equal(auditActionLabel("place.updated"), "Place details edited");
  });

  it("falls back to the raw code for anything else, including object-prototype names", () => {
    assert.equal(auditActionLabel("place.renamed_long_ago"), "place.renamed_long_ago");
    assert.equal(auditActionLabel("constructor"), "constructor");
  });
});
