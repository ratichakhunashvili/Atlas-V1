/*
 * "Scan the hotel's QR code, then create an account" (owner request, 2026-11-16): the new account starts its stay at
 * the scanned hotel straight away, without the extra "Start my stay" tap.
 *
 * Why this is safe without that tap: it runs only inside the sign-up form's POST (a deliberate action), only for an
 * account created in that same request (so it can have no stay to switch away from), and the hotel comes from the
 * scanned code checked on the server exactly as the button would (resolveHotelFromToken: valid, unrevoked, unexpired,
 * a hotel-entry code). A plain page load never starts a stay. Google sign-up and signing in to an existing account
 * keep the confirm step.
 *
 * A plain module (not "use server"): never callable from a browser with someone else's user id. Its database parts
 * are loaded lazily from server-only modules, so this file itself stays importable by tests.
 */

/** The hotel code inside a sign-up return address, or null. Only "/checkin/<token>" (where the short /C/ link forwards). */
export function hotelTokenFromCallback(callbackUrl: string | null): string | null {
  const match = callbackUrl?.match(/^\/checkin\/([^/?#]+)$/);
  if (!match) return null;
  try {
    const token = decodeURIComponent(match[1]).trim();
    return token && token !== "confirm" ? token : null;
  } catch {
    return null;
  }
}

export type JoinAfterSignupDependencies = {
  resolveHotel: (token: string, now: Date) => Promise<{ id: string; place: { name: string } } | null>;
  createStay: (input: { userId: string; hotelId: string; checkIn: Date }) => Promise<unknown>;
};

async function defaultDependencies(): Promise<JoinAfterSignupDependencies> {
  const [{ resolveHotelFromToken }, { createHotelStay }] = await Promise.all([
    import("./resolve-hotel-token"),
    import("@/db/queries/hotel-stays"),
  ]);
  return { resolveHotel: resolveHotelFromToken, createStay: createHotelStay };
}

/**
 * Starts the brand-new account's stay at the hotel whose code it scanned. Returns where to send the guest next: the
 * home page (which continues to "Plan my time") when the stay started, otherwise null so the caller keeps the original
 * return address, where an invalid or expired code is explained and the guest can still tap.
 */
export async function joinScannedHotelAfterSignup(
  input: { userId: string; callbackUrl: string | null; now: Date },
  deps?: JoinAfterSignupDependencies
): Promise<string | null> {
  const token = hotelTokenFromCallback(input.callbackUrl);
  if (!token) return null;
  const d = deps ?? (await defaultDependencies());
  const hotel = await d.resolveHotel(token, input.now);
  if (!hotel) return null;
  const created = await d.createStay({ userId: input.userId, hotelId: hotel.id, checkIn: input.now });
  if (!created) return null;
  return `/?checkinOk=${encodeURIComponent(hotel.place.name)}`;
}
