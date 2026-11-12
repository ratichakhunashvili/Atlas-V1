import "server-only";
import { currentSession } from "@/lib/authorization";
import { findCurrentStayForUser } from "@/db/queries/hotel-stays";
import { frontDeskFor, type FrontDesk } from "./front-desk";
import { validStayHotelName } from "./stay-hotel";

export type LegalViewer = { signedIn: boolean; hotelName: string | null; frontDesk: FrontDesk | null };

/**
 * Who is looking at /welcome, /terms and /privacy: signed in or not, their valid stay's hotel, and that hotel's
 * callable number if it has one. Read from the session, never from the URL.
 */
export async function loadLegalViewer(now: Date = new Date()): Promise<LegalViewer> {
  // A token whose session was ended (signed out elsewhere, password reset) counts as signed out.
  const session = await currentSession();
  if (session.status !== "signed-in") return { signedIn: false, hotelName: null, frontDesk: null };
  const userId = session.user.id;
  const stay = await findCurrentStayForUser(userId);
  const label = stay ? { checkOut: stay.checkOut, expectedCheckOut: stay.expectedCheckOut, hotelName: stay.place.name } : null;
  return {
    signedIn: true,
    hotelName: validStayHotelName(label, now),
    frontDesk: label && stay ? frontDeskFor({ ...label, phone: stay.place.phone }, now) : null,
  };
}
