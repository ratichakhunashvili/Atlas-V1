/**
 * Which hotel, if any, legal and welcome screens may name. Only the hotel of the signed-in guest's
 * own valid stay: not checked out, and not past its expected check-out. Anyone else sees "your hotel".
 */
export type StayForLabel = { checkOut: Date | null; expectedCheckOut: Date | null; hotelName: string };

export function validStayHotelName(stay: StayForLabel | null, now: Date): string | null {
  if (!stay) return null;
  if (stay.checkOut) return null;
  if (stay.expectedCheckOut && now >= stay.expectedCheckOut) return null;
  const name = stay.hotelName.trim();
  return name || null;
}

/** "Hotel X" for a guest with a valid stay, otherwise neutral wording. */
export function hotelLabel(hotelName: string | null): string {
  return hotelName ?? "your hotel";
}
