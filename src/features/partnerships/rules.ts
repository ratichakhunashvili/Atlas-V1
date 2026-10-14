import type { PartnershipStatus } from "@/db/schema";

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

type PlaceFacts = { id: string; archivedAt: Date | null };

/** Whether `place` may be proposed as an EXTERNAL partner of `hotel`. */
export function validatePartnerCandidate(input: {
  hotelPlaceId: string;
  place: PlaceFacts;
  /** True if the Place is already some hotel's own facility (hotel_facilities). */
  isHotelFacility: boolean;
}): string | null {
  if (input.place.archivedAt !== null) return "This place is archived. Unarchive it before partnering with it.";
  if (input.place.id === input.hotelPlaceId) return "A hotel can't be an external partner of itself.";
  if (input.isHotelFacility) return "This place is a hotel-owned facility, not an external partner.";
  return null;
}

/** Whether `place` may be registered as a hotel-OWNED facility of `hotel`. */
export function validateFacilityCandidate(input: {
  hotelPlaceId: string;
  place: PlaceFacts;
  /** True if any hotel already has a partnership row for this Place. */
  hasPartnershipRows: boolean;
}): string | null {
  if (input.place.archivedAt !== null) return "This place is archived. Unarchive it first.";
  if (input.place.id === input.hotelPlaceId) return "The hotel's own place can't be registered as one of its facilities.";
  if (input.hasPartnershipRows) return "This place already has external partnership records; it can't also be a hotel-owned facility.";
  return null;
}
