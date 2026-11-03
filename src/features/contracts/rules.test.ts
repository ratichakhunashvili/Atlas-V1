import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ATLAS_CONTRACT_STATUSES } from "@/db/schema";
import {
  canTransitionContract,
  contractStatusesThatCanTransitionTo,
  validateContractCandidate,
  validateKindChange,
} from "./rules";

const business = { kind: "business" as const, archivedAt: null };
const noFacts = { isHotelAnchor: false, isHotelFacility: false, hasOpenContract: false };

describe("Atlas contract transitions", () => {
  it("reaches active only from pending_review or suspended (the explicit confirmation)", () => {
    assert.deepEqual(contractStatusesThatCanTransitionTo("active").sort(), ["pending_review", "suspended"]);
  });

  it("treats ended as final, so a returning business gets a new contract and the old one stays as history", () => {
    for (const to of ATLAS_CONTRACT_STATUSES) assert.equal(canTransitionContract("ended", to), false, to);
  });

  it("can end a contract from any live status", () => {
    assert.deepEqual(contractStatusesThatCanTransitionTo("ended").sort(), ["active", "pending_review", "suspended"]);
  });

  it("never goes back to pending_review", () => {
    assert.deepEqual(contractStatusesThatCanTransitionTo("pending_review"), []);
  });
});

describe("who may get a contract", () => {
  it("accepts an unarchived business with no open contract", () => {
    assert.equal(validateContractCandidate({ place: business, ...noFacts }), null);
  });

  it("refuses attractions, hotels, hotel anchors, facilities, archived places and duplicates", () => {
    assert.match(validateContractCandidate({ place: { ...business, kind: "attraction" }, ...noFacts }) ?? "", /Attractions need none/);
    assert.match(validateContractCandidate({ place: { ...business, kind: "hotel" }, ...noFacts }) ?? "", /hotel/);
    assert.match(validateContractCandidate({ place: business, ...noFacts, isHotelAnchor: true }) ?? "", /hotel/);
    assert.match(validateContractCandidate({ place: business, ...noFacts, isHotelFacility: true }) ?? "", /facility/);
    assert.match(validateContractCandidate({ place: { ...business, archivedAt: new Date() }, ...noFacts }) ?? "", /archived/);
    assert.match(validateContractCandidate({ place: business, ...noFacts, hasOpenContract: true }) ?? "", /already/);
  });
});

describe("changing a Place's kind", () => {
  it("keeps a hotel's own place a hotel, and only a hotel's own place", () => {
    assert.notEqual(validateKindChange({ to: "business", isHotelAnchor: true, hasLiveContract: false }), null);
    assert.equal(validateKindChange({ to: "hotel", isHotelAnchor: true, hasLiveContract: false }), null);
    assert.notEqual(validateKindChange({ to: "hotel", isHotelAnchor: false, hasLiveContract: false }), null);
  });

  it("won't turn a business with a live contract into an attraction", () => {
    assert.notEqual(validateKindChange({ to: "attraction", isHotelAnchor: false, hasLiveContract: true }), null);
    assert.equal(validateKindChange({ to: "attraction", isHotelAnchor: false, hasLiveContract: false }), null);
    assert.equal(validateKindChange({ to: "business", isHotelAnchor: false, hasLiveContract: true }), null);
  });
});
