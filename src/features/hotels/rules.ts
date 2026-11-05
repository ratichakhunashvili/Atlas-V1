/**
 * Which Place may be a hotel's own place (its anchor). Pure, so it is unit-tested; the server actions load
 * the facts. Making a Place a hotel marks it `kind = hotel`, so a Place that is already something else in
 * the catalogue (a facility, a partner, a contracted business, another hotel) must not be silently taken.
 */
export function validateHotelPlaceCandidate(input: {
  place: { archivedAt: Date | null };
  /** True if the Place already belongs to a DIFFERENT hotel. */
  belongsToAnotherHotel: boolean;
  isHotelFacility: boolean;
  hasPartnershipRows: boolean;
  hasLiveContract: boolean;
}): string | null {
  if (input.place.archivedAt !== null) return "This place is archived. Unarchive it first.";
  if (input.belongsToAnotherHotel) return "This place already belongs to another hotel.";
  if (input.isHotelFacility) return "This place is a hotel facility, so it can't be a hotel itself.";
  if (input.hasPartnershipRows) return "This place has hotel partnership records, so it can't be a hotel itself.";
  if (input.hasLiveContract) return "This place has an Atlas contract, so it can't be a hotel. End the contract first.";
  return null;
}
