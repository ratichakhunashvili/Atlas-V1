import { guestStayState } from "@/features/hotel-stays/stay-state";
import type { FrontDesk } from "@/features/legal/front-desk";
import { DAY_MONTH as DAY } from "@/lib/format";
/**
 * The facts the Profile screen shows, as plain data a client component can receive.
 * Built by loadGuestProfile (guest-profile-data.ts); the stay wording is pure and tested.
 */
export type GuestProfile = {
  name: string | null;
  email: string;
  stay: {
    hotelName: string;
    imageUrl: string | null;
    /** e.g. "12 Mar – 15 Mar" */
    dates: string;
    /** e.g. "Night 2 of 3", "Stay ended" */
    progress: string;
    /** The stay is still open (not checked out), so its declared dates can be corrected in the stay-date editor. */
    canEditDates: boolean;
  } | null;
  /** The valid current stay's callable hotel; null for no stay, an ended stay, or no dialable number. */
  frontDesk: FrontDesk | null;
  achievements: { unlocked: number; total: number };
  interests: string;
  price: string;
};

const DAY_MS = 86_400_000;

export function describeStay(input: { checkIn: Date; expectedCheckOut: Date | null; checkOut: Date | null; now: Date }): { dates: string; progress: string } {
  const end = input.checkOut ?? input.expectedCheckOut;
  const dates = end ? `${DAY.format(input.checkIn)} – ${DAY.format(end)}` : `From ${DAY.format(input.checkIn)}`;
  // The same calendar-day rule as eligibility and every other guest screen (features/hotel-stays/stay-state.ts): the
  // departure day itself is still part of the stay.
  const state = guestStayState({ hotelName: "", checkIn: input.checkIn, checkOut: input.checkOut, expectedCheckOut: input.expectedCheckOut }, input.now);
  if (input.checkOut || state.kind === "ended") return { dates, progress: "Stay ended" };
  if (state.kind === "not_started") return { dates, progress: "Starts soon" };
  // Without a check-out date there is no "of N" to show.
  if (!input.expectedCheckOut) return { dates, progress: "Checked in" };
  const nights = Math.max(1, Math.ceil((input.expectedCheckOut.getTime() - input.checkIn.getTime()) / DAY_MS));
  const night = Math.min(nights, Math.floor((input.now.getTime() - input.checkIn.getTime()) / DAY_MS) + 1);
  return { dates, progress: `Night ${night} of ${nights}` };
}

/** The letter in the avatar circle. */
export function initialFor(name: string | null, email: string): string {
  return ((name?.trim() || email).charAt(0) || "?").toUpperCase();
}
