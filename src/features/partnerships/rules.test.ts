import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { PARTNERSHIP_STATUSES } from "@/db/schema";
import { confirmPartnershipSchema } from "./schema";
import {
  canTransitionPartnership,
  statusesThatCanTransitionTo,
  validateConfirmationWindow,
  validateFacilityCandidate,
  validatePartnerCandidate,
} from "./rules";

const NOW = new Date("2026-06-15T12:00:00Z");

describe("partnership status transitions", () => {
  test("the only way to become active is an explicit confirmation from pending_review or suspended; revoked must be re-opened first", () => {
    assert.deepEqual(statusesThatCanTransitionTo("active").sort(), ["pending_review", "suspended"]);
    assert.equal(canTransitionPartnership("revoked", "active"), false);
    assert.equal(canTransitionPartnership("revoked", "pending_review"), true);
  });

  test("nothing can transition to itself, and every status is known", () => {
    for (const status of PARTNERSHIP_STATUSES) assert.equal(canTransitionPartnership(status, status), false);
  });

  test("any non-revoked partnership can be revoked", () => {
    assert.deepEqual(statusesThatCanTransitionTo("revoked").sort(), ["active", "pending_review", "suspended"]);
  });
});

describe("validateConfirmationWindow", () => {
  test("no dates is fine", () => assert.equal(validateConfirmationWindow({ startsAt: null, endsAt: null, now: NOW }), null));

  test("an end date in the past is rejected", () => {
    assert.ok(validateConfirmationWindow({ startsAt: null, endsAt: new Date("2026-06-01T00:00:00Z"), now: NOW }));
  });

  test("an end date before the start date is rejected", () => {
    assert.ok(validateConfirmationWindow({ startsAt: new Date("2026-08-01T00:00:00Z"), endsAt: new Date("2026-07-01T00:00:00Z"), now: NOW }));
  });
});

describe("confirmPartnershipSchema", () => {
  test("blank fields mean no window / no priority", () => {
    const parsed = confirmPartnershipSchema.parse({ startsAt: "", endsAt: "", priority: "" });
    assert.deepEqual(parsed, { startsAt: null, endsAt: null, priority: null });
  });

  test("parses UTC dates and an integer priority; rejects junk", () => {
    const parsed = confirmPartnershipSchema.parse({ startsAt: "2026-07-01", endsAt: "2026-12-31", priority: "3" });
    assert.equal(parsed.startsAt?.toISOString(), "2026-07-01T00:00:00.000Z");
    assert.equal(parsed.priority, 3);
    assert.equal(confirmPartnershipSchema.safeParse({ startsAt: "not-a-date", endsAt: "", priority: "" }).success, false);
    assert.equal(confirmPartnershipSchema.safeParse({ startsAt: "", endsAt: "", priority: "0" }).success, false);
    assert.equal(confirmPartnershipSchema.safeParse({ startsAt: "", endsAt: "", priority: "1.5" }).success, false);
  });
});

describe("partner / facility candidate validation keeps the two concepts distinct", () => {
  const place = { id: "p", archivedAt: null };

  test("a normal external Place can be proposed as a partner", () => {
    assert.equal(validatePartnerCandidate({ hotelPlaceId: "hotel", place, isHotelFacility: false }), null);
  });

  test("an archived Place, the hotel itself, or a hotel-owned facility can't be an external partner", () => {
    assert.ok(validatePartnerCandidate({ hotelPlaceId: "hotel", place: { ...place, archivedAt: NOW }, isHotelFacility: false }));
    assert.ok(validatePartnerCandidate({ hotelPlaceId: "p", place, isHotelFacility: false }));
    assert.ok(validatePartnerCandidate({ hotelPlaceId: "hotel", place, isHotelFacility: true }));
  });

  test("a Place with partnership records, an archived Place, or the hotel itself can't be a hotel-owned facility", () => {
    assert.equal(validateFacilityCandidate({ hotelPlaceId: "hotel", place, hasPartnershipRows: false }), null);
    assert.ok(validateFacilityCandidate({ hotelPlaceId: "hotel", place, hasPartnershipRows: true }));
    assert.ok(validateFacilityCandidate({ hotelPlaceId: "hotel", place: { ...place, archivedAt: NOW }, hasPartnershipRows: false }));
    assert.ok(validateFacilityCandidate({ hotelPlaceId: "p", place, hasPartnershipRows: false }));
  });
});
