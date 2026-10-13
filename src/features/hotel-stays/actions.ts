"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization";
import { createHotelStay, findActiveStayForUser } from "@/db/queries/hotel-stays";
import { findHotelByQrToken } from "@/db/queries/hotels";
import { checkInTokenSchema } from "./schema";

export type HotelCheckInResult =
  | { ok: true; created: boolean; hotel: { id: string; name: string } }
  | { ok: false; error: string };

/**
 * The only path that creates a hotel_stays row. The client never supplies a
 * hotel id — only an opaque token, resolved to a hotel server-side. Reuses
 * hotels.qrToken (already generated at hotel creation); no second
 * "unlock"/"unlockedAt" concept is introduced.
 */
export async function checkInToHotelByToken(rawToken: string): Promise<HotelCheckInResult> {
  const user = await requireUser();

  const parsed = checkInTokenSchema.safeParse({ token: rawToken });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid token" };
  }

  const hotel = await findHotelByQrToken(parsed.data.token);
  if (!hotel) {
    return { ok: false, error: "That code doesn't match any hotel." };
  }

  const existingStay = await findActiveStayForUser(user.id);
  if (existingStay) {
    return {
      ok: true,
      created: false,
      hotel: { id: existingStay.hotel.id, name: existingStay.place.name },
    };
  }

  const created = await createHotelStay({ userId: user.id, hotelId: hotel.id, checkIn: new Date() });
  if (!created) {
    // Lost a race with a concurrent check-in request — report the stay that
    // won instead of failing.
    const stay = await findActiveStayForUser(user.id);
    if (stay) {
      return { ok: true, created: false, hotel: { id: stay.hotel.id, name: stay.place.name } };
    }
    return { ok: false, error: "Could not check in right now. Please try again." };
  }

  revalidatePath("/");
  return { ok: true, created: true, hotel: { id: hotel.id, name: hotel.place.name } };
}

/** Form-bound wrapper for the manual/dev token entry on the home page — redirects with a status query param, matching Atlas's existing action convention (see features/places/actions.ts). */
export async function checkInToHotelFormAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const result = await checkInToHotelByToken(token);

  if (!result.ok) {
    redirect(`/?checkinError=${encodeURIComponent(result.error)}`);
  }

  redirect(`/?checkinOk=${encodeURIComponent(result.hotel.name)}`);
}
