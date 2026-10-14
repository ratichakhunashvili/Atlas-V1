"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authorization";
import { PG_CHECK_VIOLATION, PG_FOREIGN_KEY_VIOLATION, hasPgErrorCode } from "@/db/errors";
import { createPlace, deletePlace, setPlaceArchived, updatePlace } from "@/db/queries/places";
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
    publicationStatus: formData.get("publicationStatus") ?? undefined,
    verificationStatus: formData.get("verificationStatus") ?? undefined,
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
    publicationStatus: parsed.data.publicationStatus,
    verificationStatus: parsed.data.verificationStatus,
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

  try {
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
      publicationStatus: parsed.data.publicationStatus,
      verificationStatus: parsed.data.verificationStatus,
    });
  } catch (error) {
    // places_archived_not_published_check: an archived place can't be published.
    if (hasPgErrorCode(error, PG_CHECK_VIOLATION)) {
      redirect(
        `/admin/places/${id}?error=${encodeURIComponent("This place is archived, so it can't be published. Unarchive it first, then publish.")}`
      );
    }
    throw error;
  }

  revalidatePath("/admin/places");
  redirect("/admin/places");
}

/**
 * Deleting a Place that has partnership/facility history is blocked by the
 * database (ON DELETE RESTRICT) — archive it instead. The FK violation is
 * caught and turned into a clear message rather than a 500.
 */
export async function deletePlaceAction(formData: FormData) {
  await requireAdmin();

  const id = formData.get("id");
  if (typeof id === "string" && id) {
    try {
      await deletePlace(id);
    } catch (error) {
      if (hasPgErrorCode(error, PG_FOREIGN_KEY_VIOLATION)) {
        redirect(
          `/admin/places?error=${encodeURIComponent(
            "This place has partnership, facility, or hotel records and can't be deleted. Archive it instead."
          )}`
        );
      }
      throw error;
    }
  }

  revalidatePath("/admin/places");
  redirect("/admin/places");
}

export async function archivePlaceAction(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id");
  if (typeof id === "string" && id) await setPlaceArchived(id, true);
  revalidatePath("/admin/places");
  redirect("/admin/places");
}

export async function unarchivePlaceAction(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id");
  if (typeof id === "string" && id) await setPlaceArchived(id, false);
  revalidatePath("/admin/places");
  redirect("/admin/places");
}
