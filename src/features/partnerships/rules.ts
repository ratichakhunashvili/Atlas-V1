import type { PartnershipStatus, PlaceKind } from "@/db/schema";

/**
 * Pure admin-workflow rules for hotel partnerships and facilities — no DB, no
 * auth. The server actions load the facts these functions need, then ask
 * them; the database CHECK constraints (active requires confirmed_at, valid
 * window) are the last line of defense behind them.
 */

/**
 * pending_review -> active is the explicit admin confirmation. A revoked
 * relationship can only be re-opened as pending_review, so re-activating it
 * needs a fresh, explicit confirmation too.
 */
export const PARTNERSHIP_TRANSITIONS: Record<PartnershipStatus, readonly PartnershipStatus[]> = {
  pending_review: ["active", "revoked"],
  active: ["suspended", "revoked"],
  suspended: ["active", "revoked"],
  revoked: ["pending_review"],
};

export function canTransitionPartnership(from: PartnershipStatus, to: PartnershipStatus): boolean {
  return PARTNERSHIP_TRANSITIONS[from].includes(to);
}

/** The statuses from which `to` is reachable — used as the compare-and-set guard in the UPDATE. */
export function statusesThatCanTransitionTo(to: PartnershipStatus): PartnershipStatus[] {
  return (Object.keys(PARTNERSHIP_TRANSITIONS) as PartnershipStatus[]).filter((from) => canTransitionPartnership(from, to));
}

export function validateConfirmationWindow(input: { startsAt: Date | null; endsAt: Date | null; now: Date }): string | null {
  const { startsAt, endsAt, now } = input;
  if (endsAt !== null && endsAt.getTime() <= now.getTime()) return "The end date must be in the future.";
  if (startsAt !== null && endsAt !== null && endsAt.getTime() <= startsAt.getTime()) return "The end date must be after the start date.";
  return null;
}

type PlaceFacts = { id: string; archivedAt: Date | null; kind: PlaceKind };

/** A hotel is never another hotel's partner or facility: guests only ever see their own hotel. */
function isAHotel(place: PlaceFacts, isHotelAnchor: boolean) {
  return isHotelAnchor || place.kind === "hotel";
}

/**
 * Whether `place` may get a promotion (a hotel partnership) from `hotel`, when it is proposed and again when it is
 * confirmed. Under the catalogue rule (docs/catalogue-model-plan.md §4) the Place must already be an Atlas partner.
 */
export function validatePartnerCandidate(input: {
  hotelPlaceId: string;
  place: PlaceFacts;
  /** True if the Place is already some hotel's own facility (hotel_facilities). */
  isHotelFacility: boolean;
  /** True if the Place is the anchor of any hotel. */
  isHotelAnchor: boolean;
  /** True if the Place has an Atlas contract in force now. A partnership only promotes an Atlas partner. */
  hasContractInForce: boolean;
}): string | null {
  if (input.place.archivedAt !== null) return "This place is archived. Unarchive it before partnering with it.";
  if (input.place.id === input.hotelPlaceId) return "A hotel can't be a partner of itself.";
  if (isAHotel(input.place, input.isHotelAnchor)) return "A hotel can't be another hotel's partner.";
  if (input.isHotelFacility) return "This place is a hotel-owned facility, not an external partner.";
  if (!input.hasContractInForce) {
    return "This place has no active Atlas contract. A hotel can only promote an Atlas partner: confirm its contract under Atlas contracts first.";
  }
  return null;
}

/** Whether `place` may be registered as a hotel-OWNED facility of `hotel`. */
export function validateFacilityCandidate(input: {
  hotelPlaceId: string;
  place: PlaceFacts;
  /** True if any hotel already has a partnership row for this Place. */
  hasPartnershipRows: boolean;
  /** True if the Place is the anchor of any hotel. */
  isHotelAnchor: boolean;
}): string | null {
  if (input.place.archivedAt !== null) return "This place is archived. Unarchive it first.";
  if (input.place.id === input.hotelPlaceId) return "The hotel's own place can't be registered as one of its facilities.";
  if (isAHotel(input.place, input.isHotelAnchor)) return "Another hotel can't be registered as a facility.";
  if (input.hasPartnershipRows) return "This place already has hotel partnership records, so it can't also be a hotel-owned facility.";
  return null;
}
