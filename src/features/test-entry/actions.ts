"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/authorization";
import { createHotelStay, findActiveStayForUser } from "@/db/queries/hotel-stays";
import { findHotelById } from "@/db/queries/hotels";
import { decideForCurrentUser } from "./offer";

/**
 * The no-QR entry for allowlisted test accounts in local/development and QA/staging.
 *
 * Takes no arguments on purpose: there is no hotel, flag or token for a request to supply. Production, a missing or
 * unknown environment, a non-allowlisted account and an unmapped account all end here with the same refusal. This is
 * the ONLY export of this module — the offer/decision helpers live in ./offer.ts (server-only), so nothing here is a
 * callable probe of who is allowlisted.
 */
export async function enterTestStayFormAction() {
  const user = await requireUser();

  const decision = await decideForCurrentUser(user.id);
  if (!decision.allowed) {
    redirect(`/?checkinError=${encodeURIComponent("Test entry isn't available. Scan your hotel's QR code instead.")}`);
  }

  const hotel = await findHotelById(decision.hotelId);
  if (!hotel) {
    redirect(`/?checkinError=${encodeURIComponent("The test hotel isn't seeded here. Scan your hotel's QR code instead.")}`);
  }

  const existing = await findActiveStayForUser(user.id);
  if (existing && existing.hotel.id !== hotel.id) {
    // Never silently end a real stay for the test fixture: switching stays its own confirmed flow.
    redirect(`/?checkinError=${encodeURIComponent("You already have an active stay. Finish or switch it first.")}`);
  }

  if (!existing) {
    await createHotelStay({ userId: user.id, hotelId: hotel.id, checkIn: new Date() });
    revalidatePath("/");
  }

  redirect(`/?checkinOk=${encodeURIComponent(hotel.place.name)}`);
}
