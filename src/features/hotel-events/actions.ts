"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authorization";
import { cancelHotelEvent, createHotelEvent } from "@/db/queries/hotel-events";
import { findHotelById } from "@/db/queries/hotels";
import { listEligiblePlacesForStay } from "@/services/eligibility";
import { hotelEventSchema } from "./schema";
import { isVenueEligibleForEvent, lastMomentOf } from "./venue";

/**
 * Creates a scheduled event for one hotel.
 *
 * `hotelId` is bound by the admin page, so it is validated as input like
 * anything else, and the venue must be a Place that is already eligible for THIS
 * hotel — a facility it owns or a confirmed partner. That check is the same
 * server-side eligibility service the Advisor uses, so an event cannot become a
 * way to put an unapproved Place in front of a guest.
 */
export async function createHotelEventAction(hotelId: string, formData: FormData) {
  await requireAdmin();

  const hotel = await findHotelById(hotelId);
  if (!hotel) redirect("/admin/hotels");

  const parsed = hotelEventSchema.safeParse({
    venuePlaceId: formData.get("venuePlaceId") ?? "",
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    startsAt: formData.get("startsAt") ?? "",
    endsAt: formData.get("endsAt") ?? "",
  });

  if (!parsed.success) {
    redirect(
      `/admin/hotels/${hotelId}/events?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`
    );
  }

  /*
   * Eligibility is judged AT THE EVENT'S OWN TIME, at both its start and its last moment — not now. A partnership
   * that is active today but ends before the event (or starts after it) must not let the event through.
   */
  const [eligibleAtStart, eligibleAtEnd] = await Promise.all([
    listEligiblePlacesForStay({ hotel, place: hotel.place }, parsed.data.startsAt),
    listEligiblePlacesForStay({ hotel, place: hotel.place }, lastMomentOf({ endsAt: parsed.data.endsAt })),
  ]);
  const venueIsEligible = isVenueEligibleForEvent({
    venuePlaceId: parsed.data.venuePlaceId,
    eligibleAtStart,
    eligibleAtEnd,
  });

  if (!venueIsEligible) {
    redirect(
      `/admin/hotels/${hotelId}/events?error=${encodeURIComponent(
        "That venue is not an eligible Place for this hotel at the time of the event. Add it as a facility, or confirm a partnership that covers the whole event."
      )}`
    );
  }

  await createHotelEvent({
    hotelId,
    venuePlaceId: parsed.data.venuePlaceId,
    title: parsed.data.title,
    description: parsed.data.description,
    startsAt: parsed.data.startsAt,
    endsAt: parsed.data.endsAt,
  });

  revalidatePath(`/admin/hotels/${hotelId}/events`);
  redirect(`/admin/hotels/${hotelId}/events`);
}

/** Cancels rather than deletes: a guest may already have this event in a saved plan, and that plan is history. */
export async function cancelHotelEventAction(hotelId: string, eventId: string) {
  await requireAdmin();

  await cancelHotelEvent(eventId, hotelId);

  revalidatePath(`/admin/hotels/${hotelId}/events`);
  redirect(`/admin/hotels/${hotelId}/events`);
}
