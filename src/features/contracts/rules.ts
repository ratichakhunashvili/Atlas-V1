import type { AtlasContractStatus, PlaceKind } from "@/db/schema";

/**
 * Pure admin-workflow rules for Atlas partner contracts and Place kinds (docs/catalogue-model-plan.md). No DB, no
 * auth: the server actions load the facts, then ask these. The database constraints (one active / one pending
 * contract per Place, active requires confirmation, ended requires a date, valid window) stand behind them.
 *
 * Phase C1: nothing here changes what guests see. Guest eligibility does not read contracts or kinds yet.
 */

/**
 * pending_review -> active is the explicit admin confirmation; suspended -> active resumes it (also an explicit
 * confirmation). `ended` is final: a business that comes back gets a NEW proposal, so the ended row stays as history.
 */
export const CONTRACT_TRANSITIONS: Record<AtlasContractStatus, readonly AtlasContractStatus[]> = {
  pending_review: ["active", "ended"],
  active: ["suspended", "ended"],
  suspended: ["active", "ended"],
  ended: [],
};

export function canTransitionContract(from: AtlasContractStatus, to: AtlasContractStatus): boolean {
  return CONTRACT_TRANSITIONS[from].includes(to);
}

/** The statuses from which `to` is reachable — the compare-and-set guard in the UPDATE. */
export function contractStatusesThatCanTransitionTo(to: AtlasContractStatus): AtlasContractStatus[] {
  return (Object.keys(CONTRACT_TRANSITIONS) as AtlasContractStatus[]).filter((from) => canTransitionContract(from, to));
}

/** Whether a contract is in force at `now`. The guest catalogue's own test, shared so admin decisions (hotel promotion) agree with it. */
export { isContractInForce } from "@/services/eligibility/rules";

/** Whether a NEW contract may be proposed for this Place. */
export function validateContractCandidate(input: {
  place: { kind: PlaceKind; archivedAt: Date | null };
  /** The Place is some hotel's anchor (hotels.place_id). */
  isHotelAnchor: boolean;
  /** The Place is some hotel's own facility (hotel_facilities). Decision 5: facilities are never Atlas partners. */
  isHotelFacility: boolean;
  /** The Place already has a pending_review or active contract. */
  hasOpenContract: boolean;
}): string | null {
  if (input.place.archivedAt !== null) return "This place is archived. Unarchive it before proposing a contract.";
  if (input.isHotelAnchor || input.place.kind === "hotel") return "A hotel can't have an Atlas partner contract.";
  if (input.isHotelFacility) return "This place is a hotel-owned facility. Facilities are shown only to their own hotel's guests.";
  if (input.place.kind !== "business") return "Only a business can have an Atlas contract. Attractions need none.";
  if (input.hasOpenContract) return "This place already has a contract that is pending review or active.";
  return null;
}

/** Whether an admin may set `to` as the kind of this Place. */
export function validateKindChange(input: {
  to: PlaceKind;
  isHotelAnchor: boolean;
  /** The Place has a pending_review, active or suspended contract. */
  hasLiveContract: boolean;
}): string | null {
  if (input.isHotelAnchor && input.to !== "hotel") return "This place is a hotel's own place, so its kind must stay Hotel.";
  if (!input.isHotelAnchor && input.to === "hotel") {
    return "Only a hotel's own place can be a Hotel. Create the hotel from Hotels instead.";
  }
  if (input.hasLiveContract && input.to !== "business") {
    return "End this place's Atlas contract before changing it from Business.";
  }
  return null;
}
