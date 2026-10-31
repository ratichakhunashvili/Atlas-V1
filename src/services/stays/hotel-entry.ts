/**
 * What scanning a hotel-entry QR should do, given the guest's current stay.
 *
 * Pure on purpose: the hotel always comes from the credential the guest
 * physically scanned (resolved server-side), never from a client-supplied
 * hotel id, and this function only decides what to do about the stay they
 * already have.
 */

export type ActiveStaySummary = { hotelId: string; hotelName: string };

export type HotelEntryDecision =
  /** No active stay: scanning starts one. */
  | { action: "create_stay" }
  /** Already staying at exactly this hotel: scanning again changes nothing. */
  | { action: "already_here" }
  /**
   * Staying somewhere else. Approved behaviour (2026-10-14): this is NOT done
   * silently — the guest confirms, and only then is the old stay closed and the
   * new one opened, in one transaction. Previously this case silently returned
   * success naming the guest's OLD hotel, which told them they were somewhere
   * they had just walked out of.
   */
  | { action: "switch_required"; from: ActiveStaySummary };

export function decideHotelEntry(
  activeStay: ActiveStaySummary | null,
  scannedHotelId: string
): HotelEntryDecision {
  if (!activeStay) return { action: "create_stay" };
  if (activeStay.hotelId === scannedHotelId) return { action: "already_here" };
  return { action: "switch_required", from: activeStay };
}
