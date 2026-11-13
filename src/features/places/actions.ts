"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { requireAdmin } from "@/lib/authorization";
import { PG_CHECK_VIOLATION, PG_FOREIGN_KEY_VIOLATION, hasPgErrorCode } from "@/db/errors";
import { recordAdminAudit } from "@/db/queries/admin-audit";
import {
  adminListDuplicateCandidates,
  createPlace,
  deletePlace,
  findPlaceById,
  setPlaceArchived,
} from "@/db/queries/places";
import { placeStatusAuditActions, placeStatusSnapshot as statusSnapshot, updatePlaceWithAudit } from "@/db/operations/place-admin";
import type { Place } from "@/db/schema";
import { findLikelyDuplicates } from "@/services/catalog/duplicates";
import { isUuid } from "@/lib/route-ids";
import { placeFormQuery } from "./prefill";
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
    visitDurationMinutes: formData.get("visitDurationMinutes") ?? "",
    priceLevel: formData.get("priceLevel") ?? "",
    priceLevelSource: formData.get("priceLevelSource") ?? "",
    publicationStatus: formData.get("publicationStatus") ?? undefined,
    verificationStatus: formData.get("verificationStatus") ?? undefined,
  });
}

/**
 * A price level only exists with its evidence: a source, and the moment an admin confirmed it. With no level there is
 * no evidence either. Returns an error message when a level is set without saying where it came from.
 */
function priceEvidence(
  data: { priceLevel: number | null; priceLevelSource?: string },
  before: Pick<Place, "priceLevel" | "priceLevelSource" | "priceLevelVerifiedAt"> | null,
  now: Date
): { error: string } | { priceLevelSource: string | null; priceLevelVerifiedAt: Date | null } {
  if (data.priceLevel === null) return { priceLevelSource: null, priceLevelVerifiedAt: null };
  if (!data.priceLevelSource) return { error: "Say where the price level comes from, or set it back to unknown." };
  const unchanged =
    before !== null &&
    before.priceLevel === data.priceLevel &&
    before.priceLevelSource === data.priceLevelSource &&
    before.priceLevelVerifiedAt !== null;
  return { priceLevelSource: data.priceLevelSource, priceLevelVerifiedAt: unchanged ? before!.priceLevelVerifiedAt : now };
}

/** Writes one audit entry per eligibility-relevant status change of a newly created Place. */
async function auditStatusChanges(
  adminId: string,
  before: Pick<Place, "publicationStatus" | "verificationStatus" | "archivedAt">,
  after: Place
) {
  for (const action of placeStatusAuditActions(before, after)) {
    await recordAdminAudit({
      actorUserId: adminId,
      action,
      targetType: "place",
      targetId: after.id,
      before: statusSnapshot(before),
      after: statusSnapshot(after),
    });
  }
}

export async function createPlaceAction(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = parsePlaceForm(formData);
  if (!parsed.success) {
    redirect(`/admin/places/new?${placeFormQuery(formData, { error: parsed.error.issues[0]?.message ?? "Invalid input" })}`);
  }

  /*
   * Likely-duplicate check. It only SUGGESTS: if anything resembles this Place the admin is sent back to the form
   * with the values pre-filled and the matches listed, and creating anyway is a deliberate second submit. Nothing is
   * merged, deleted or blocked automatically.
   */
  const confirmedAnyway = formData.get("confirmCreateAnyway") === "1";
  if (!confirmedAnyway) {
    const matches = findLikelyDuplicates(
      { name: parsed.data.name, latitude: parsed.data.latitude, longitude: parsed.data.longitude },
      await adminListDuplicateCandidates({
        name: parsed.data.name,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
      })
    );
    if (matches.length > 0) {
      redirect(`/admin/places/new?${placeFormQuery(formData, { duplicates: "1" })}`);
    }
  }

  const evidence = priceEvidence(parsed.data, null, new Date());
  if ("error" in evidence) {
    redirect(`/admin/places/new?${placeFormQuery(formData, { error: evidence.error })}`);
  }

  const created = await createPlace({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    category: parsed.data.category,
    address: parsed.data.address ?? null,
    imageUrl: parsed.data.imageUrl ?? null,
    website: parsed.data.website ?? null,
    phone: parsed.data.phone ?? null,
    visitDurationMinutes: parsed.data.visitDurationMinutes,
    priceLevel: parsed.data.priceLevel,
    priceLevelSource: evidence.priceLevelSource,
    priceLevelVerifiedAt: evidence.priceLevelVerifiedAt,
    publicationStatus: parsed.data.publicationStatus,
    verificationStatus: parsed.data.verificationStatus,
  });

  await recordAdminAudit({
    actorUserId: admin.id,
    action: "place.created",
    targetType: "place",
    targetId: created.id,
    after: statusSnapshot(created),
    reason: confirmedAnyway ? "created after a likely-duplicate warning" : null,
  });
  // A Place created already published/verified becomes eligible-capable immediately, so say so in the trail.
  await auditStatusChanges(admin.id, { publicationStatus: "draft", verificationStatus: "unverified", archivedAt: null }, created);

  revalidatePath("/admin/places");
  redirect(`/admin/places/${created.id}?ok=${encodeURIComponent(`${created.name} created. Next, confirm its kind below.`)}`);
}

export async function updatePlaceAction(id: string, formData: FormData) {
  const admin = await requireAdmin();
  if (!isUuid(id)) redirect("/admin/places");

  const parsed = parsePlaceForm(formData);
  if (!parsed.success) {
    redirect(`/admin/places/${id}?${placeFormQuery(formData, { error: parsed.error.issues[0]?.message ?? "Invalid input" })}`);
  }

  const before = await findPlaceById(id);
  if (!before) redirect(`/admin/places?error=${encodeURIComponent("That place no longer exists.")}`);
  const evidence = priceEvidence(parsed.data, before, new Date());
  if ("error" in evidence) {
    redirect(`/admin/places/${id}?${placeFormQuery(formData, { error: evidence.error })}`);
  }

  // The edit and its audit entries (place.updated with only the changed fields, plus any publication/verification
  // change) are written in one transaction: if either fails, neither is saved.
  let saved: Awaited<ReturnType<typeof updatePlaceWithAudit>> = null;
  try {
    saved = await updatePlaceWithAudit(db, {
      actorUserId: admin.id,
      placeId: id,
      changes: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        category: parsed.data.category,
        address: parsed.data.address ?? null,
        imageUrl: parsed.data.imageUrl ?? null,
        website: parsed.data.website ?? null,
        phone: parsed.data.phone ?? null,
        visitDurationMinutes: parsed.data.visitDurationMinutes,
        priceLevel: parsed.data.priceLevel,
        priceLevelSource: evidence.priceLevelSource,
        priceLevelVerifiedAt: evidence.priceLevelVerifiedAt,
        publicationStatus: parsed.data.publicationStatus,
        verificationStatus: parsed.data.verificationStatus,
      },
    });
  } catch (error) {
    // places_archived_not_published_check: an archived place can't be published.
    if (hasPgErrorCode(error, PG_CHECK_VIOLATION)) {
      redirect(
        `/admin/places/${id}?${placeFormQuery(formData, { error: "This place is archived, so it can't be published. Unarchive it first, then publish." })}`
      );
    }
    throw error;
  }

  if (!saved) redirect(`/admin/places?error=${encodeURIComponent("That place no longer exists.")}`);

  revalidatePath("/admin/places");
  revalidatePath(`/admin/places/${id}`);
  redirect(`/admin/places/${id}?ok=${encodeURIComponent("Place saved.")}`);
}

/**
 * Deleting a Place that has partnership/facility history is blocked by the
 * database (ON DELETE RESTRICT) — archive it instead. The FK violation is
 * caught and turned into a clear message rather than a 500.
 */
export async function deletePlaceAction(formData: FormData) {
  const admin = await requireAdmin();

  const id = formData.get("id");
  if (typeof id === "string" && isUuid(id)) {
    const before = await findPlaceById(id);
    try {
      await deletePlace(id);
    } catch (error) {
      // RESTRICT foreign keys report 23503 or 23001 (restrict_violation): either way, history is in the way.
      if (hasPgErrorCode(error, PG_FOREIGN_KEY_VIOLATION) || hasPgErrorCode(error, "23001")) {
        redirect(
          `/admin/places/${id}?error=${encodeURIComponent(
            "This place has history (a hotel, partnership, facility, contract, achievement or visits), so it can't be deleted. Archive it instead."
          )}`
        );
      }
      throw error;
    }
    if (before) {
      await recordAdminAudit({
        actorUserId: admin.id,
        action: "place.deleted",
        targetType: "place",
        targetId: before.id,
        before: { name: before.name, ...statusSnapshot(before) },
      });
    }
  }

  revalidatePath("/admin/places");
  redirect(`/admin/places?ok=${encodeURIComponent("Place deleted.")}`);
}

async function archiveChange(formData: FormData, archived: boolean) {
  const admin = await requireAdmin();
  const id = formData.get("id");
  if (typeof id !== "string" || !isUuid(id)) redirect("/admin/places");
  const before = await findPlaceById(id);
  const after = await setPlaceArchived(id, archived);
  if (!before || !after) redirect(`/admin/places?error=${encodeURIComponent("That place no longer exists.")}`);
  await recordAdminAudit({
    actorUserId: admin.id,
    action: archived ? "place.archived" : "place.unarchived",
    targetType: "place",
    targetId: id,
    before: statusSnapshot(before),
    after: statusSnapshot(after),
  });
  revalidatePath("/admin/places");
  revalidatePath(`/admin/places/${id}`);
  const message = archived ? "Place archived. Guests no longer see it." : "Place unarchived. It stays a draft until you publish it again.";
  redirect(`/admin/places/${id}?ok=${encodeURIComponent(message)}`);
}

export async function archivePlaceAction(formData: FormData) {
  return archiveChange(formData, true);
}

export async function unarchivePlaceAction(formData: FormData) {
  return archiveChange(formData, false);
}
