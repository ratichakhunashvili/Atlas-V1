"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authorization";
import { createPlace, deletePlace, updatePlace } from "@/db/queries/places";
import { placeSchema } from "./schema";

function parsePlaceForm(formData: FormData) {
  return placeSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    latitude: formData.get("latitude") ?? "",
    longitude: formData.get("longitude") ?? "",
    category: formData.get("category") ?? "",
    address: formData.get("address") ?? "",
    imageUrl: formData.get("imageUrl") ?? "",
    website: formData.get("website") ?? "",
    phone: formData.get("phone") ?? "",
  });
}

export async function createPlaceAction(formData: FormData) {
  await requireAdmin();

  const parsed = parsePlaceForm(formData);
  if (!parsed.success) {
    redirect(
      `/admin/places/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`
    );
  }

  await createPlace({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    category: parsed.data.category,
    address: parsed.data.address ?? null,
    imageUrl: parsed.data.imageUrl ?? null,
    website: parsed.data.website ?? null,
    phone: parsed.data.phone ?? null,
  });

  revalidatePath("/admin/places");
  redirect("/admin/places");
}

export async function updatePlaceAction(id: string, formData: FormData) {
  await requireAdmin();

  const parsed = parsePlaceForm(formData);
  if (!parsed.success) {
    redirect(
      `/admin/places/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`
    );
  }

  await updatePlace(id, {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    category: parsed.data.category,
    address: parsed.data.address ?? null,
    imageUrl: parsed.data.imageUrl ?? null,
    website: parsed.data.website ?? null,
    phone: parsed.data.phone ?? null,
  });

  revalidatePath("/admin/places");
  redirect("/admin/places");
}

export async function deletePlaceAction(formData: FormData) {
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id === "string" && id) {
    await deletePlace(id);
  }

  revalidatePath("/admin/places");
  redirect("/admin/places");
}
