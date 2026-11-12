import { test } from "node:test";
import assert from "node:assert/strict";
import { explainCatalogueExclusion, type ExclusionInput } from "./rules";

const now = new Date("2026-11-12T10:00:00Z");
const day = (d: number) => new Date(now.getTime() + d * 86_400_000);
const ready: ExclusionInput["place"] = { kind: "business", publicationStatus: "published", verificationStatus: "verified", archivedAt: null };
const inForce = { status: "active" as const, confirmedAt: day(-1), startsAt: null, endsAt: null };

test("a ready business with a contract in force has nothing to explain", () => {
  assert.deepEqual(explainCatalogueExclusion({ place: ready, contracts: [inForce], facilities: [] }, now), []);
});

test("place problems are all listed, alongside the contract problem", () => {
  assert.deepEqual(
    explainCatalogueExclusion(
      { place: { kind: "business", publicationStatus: "draft", verificationStatus: "unverified", archivedAt: day(-2) }, contracts: [], facilities: [] },
      now
    ),
    ["archived", "unpublished", "unverified", "no_contract"]
  );
});

test("each contract state gets its own reason", () => {
  const reason = (contracts: ExclusionInput["contracts"]) => explainCatalogueExclusion({ place: ready, contracts, facilities: [] }, now);
  assert.deepEqual(reason([{ ...inForce, confirmedAt: null }]), ["contract_unconfirmed"]);
  assert.deepEqual(reason([{ ...inForce, startsAt: day(3) }]), ["contract_not_started"]);
  assert.deepEqual(reason([{ ...inForce, endsAt: now }]), ["contract_expired"]);
  assert.deepEqual(reason([{ ...inForce, status: "suspended" }]), ["contract_suspended"]);
  assert.deepEqual(reason([{ ...inForce, status: "pending_review", confirmedAt: null }]), ["contract_pending_review"]);
  assert.deepEqual(reason([{ ...inForce, status: "ended" }]), ["contract_ended"]);
  // A new proposal after an ended contract: the pending review is what an admin can act on.
  assert.deepEqual(reason([{ ...inForce, status: "ended" }, { ...inForce, status: "pending_review", confirmedAt: null }]), ["contract_pending_review"]);
});

test("an attraction needs no contract; a facility is explained by its facility row, not a contract", () => {
  assert.deepEqual(explainCatalogueExclusion({ place: { ...ready, kind: "attraction" }, contracts: [], facilities: [] }, now), []);
  assert.deepEqual(explainCatalogueExclusion({ place: ready, contracts: [], facilities: [{ status: "inactive" }] }, now), ["facility_inactive"]);
  assert.deepEqual(explainCatalogueExclusion({ place: ready, contracts: [], facilities: [{ status: "active" }] }, now), []);
});
