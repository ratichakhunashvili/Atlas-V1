"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authorization";
import { countHotelDeletionBlockers, createHotel, deleteHotel, updateHotelPlace } from "@/db/queries/hotels";
import { hasHotelDeletionBlockers, hotelDeletionBlockedMessage } from "@/db/operations/hotel-deletion";
import { hotelSchema } from "./schema";

export async function createHotelAction(formData: FormData) {
  await requireAdmin();

  const parsed = hotelSchema.safeParse({ placeId: formData.get("placeId") ?? "" });
  if (!parsed.success) {
    redirect(
      `/admin/hotels/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`
    );
  }

  // No entry credential is minted here. A hotel starts with none, and an admin
  // issues one deliberately from its edit page, where the raw code is shown once.
  await createHotel({ placeId: parsed.data.placeId });

  revalidatePath("/admin/hotels");
  redirect("/admin/hotels");
}

export async function updateHotelAction(id: string, formData: FormData) {
  await requireAdmin();

  const parsed = hotelSchema.safeParse({ placeId: formData.get("placeId") ?? "" });
  if (!parsed.success) {
    redirect(
      `/admin/hotels/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`
    );
  }

  await updateHotelPlace(id, parsed.data.placeId);

  revalidatePath("/admin/hotels");
  redirect("/admin/hotels");
}

export async function deleteHotelAction(formData: FormData) {
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id !== "string" || !id) redirect("/admin/hotels");

  /*
   * Refuse before deleting anything.
   *
   * Migration 0009 makes the database refuse as well — guest stays and itineraries
   * are now RESTRICT — but an admin deserves a sentence naming what is in the way
   * rather than a raw constraint error. And the hotel's OWN records (partnerships,
   * facilities, events, credentials) still cascade, so without this check they
   * would disappear with one click and no warning.
   */
  const blockers = await countHotelDeletionBlockers(id);
  if (hasHotelDeletionBlockers(blockers)) {
    redirect(`/admin/hotels?error=${encodeURIComponent(hotelDeletionBlockedMessage(blockers))}`);
  }

  await deleteHotel(id);

  revalidatePath("/admin/hotels");
  redirect("/admin/hotels");
}
