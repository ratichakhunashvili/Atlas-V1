"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authorization";
import { cancelHotelEvent, createHotelEvent } from "@/db/queries/hotel-events";
import { findHotelById } from "@/db/queries/hotels";
import { listEligiblePlacesForStay } from "@/services/eligibility";
import { isUuid } from "@/lib/route-ids";
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
const FORM_FIELDS = ["venuePlaceId", "title", "description", "startsAt", "endsAt"] as const;

function eventsPath(hotelId: string, query: Record<string, string>) {
  return `/admin/hotels/${hotelId}/events?${new URLSearchParams(query).toString()}`;
}

export async function createHotelEventAction(hotelId: string, formData: FormData) {
  await requireAdmin();

  if (!isUuid(hotelId)) redirect("/admin");
  const hotel = await findHotelById(hotelId);
  if (!hotel) redirect("/admin");

  const values = Object.fromEntries(FORM_FIELDS.map((field) => [field, String(formData.get(field) ?? "")]));
  // On an error the admin's typed values go back into the form (event details, nothing personal).
  function fail(message: string): never {
    redirect(eventsPath(hotelId, { ...values, error: message }));
  }

  const parsed = hotelEventSchema.safeParse(values);
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid input.");

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
    fail(
      "That venue isn't available to this hotel's guests at the time of the event. Add it as a facility, or confirm a partnership that covers the whole event."
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
  redirect(eventsPath(hotel.id, { ok: `"${parsed.data.title}" is scheduled.` }));
}

/** Cancels rather than deletes: a guest may already have this event in a saved plan, and that plan is history. */
export async function cancelHotelEventAction(hotelId: string, eventId: string) {
  await requireAdmin();

  if (!isUuid(hotelId) || !isUuid(eventId)) redirect("/admin");
  const cancelled = await cancelHotelEvent(eventId, hotelId);

  revalidatePath(`/admin/hotels/${hotelId}/events`);
  redirect(
    eventsPath(hotelId, cancelled ? { ok: `"${cancelled.title}" was cancelled.` } : { error: "That event was already cancelled or no longer exists." })
  );
}
