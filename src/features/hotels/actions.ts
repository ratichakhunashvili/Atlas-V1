"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authorization";
import { createHotel, deleteHotel, updateHotelPlace } from "@/db/queries/hotels";
import { hotelSchema } from "./schema";

export async function createHotelAction(formData: FormData) {
  await requireAdmin();

  const parsed = hotelSchema.safeParse({ placeId: formData.get("placeId") ?? "" });
  if (!parsed.success) {
    redirect(
      `/admin/hotels/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`
    );
  }

  await createHotel({ placeId: parsed.data.placeId, qrToken: crypto.randomUUID() });

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
  if (typeof id === "string" && id) {
    await deleteHotel(id);
  }

  revalidatePath("/admin/hotels");
  redirect("/admin/hotels");
}
