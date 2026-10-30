"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authorization";
import { PG_CHECK_VIOLATION, PG_FOREIGN_KEY_VIOLATION, hasPgErrorCode } from "@/db/errors";
import { recordAdminAudit } from "@/db/queries/admin-audit";
import {
  adminListDuplicateCandidates,
  createPlace,
  deletePlace,
  findPlaceById,
  setPlaceArchived,
  updatePlace,
} from "@/db/queries/places";
import type { AdminAuditAction, Place } from "@/db/schema";
import { findLikelyDuplicates } from "@/services/catalog/duplicates";
import { placeSchema } from "./schema";

const PLACE_FORM_FIELDS = [
  "name",
  "description",
  "latitude",
  "longitude",
  "category",
  "address",
  "imageUrl",
  "website",
  "phone",
  "visitDurationMinutes",
  "priceLevel",
  "priceLevelSource",
  "publicationStatus",
  "verificationStatus",
] as const;

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

/** The status fields an audit entry needs from a Place — only what can change eligibility, never the whole row. */
function statusSnapshot(place: Pick<Place, "publicationStatus" | "verificationStatus" | "archivedAt">) {
  return {
    publicationStatus: place.publicationStatus,
    verificationStatus: place.verificationStatus,
    archived: place.archivedAt !== null,
  };
}

/** Writes one audit entry per eligibility-relevant status change, comparing the Place before and after an edit. */
async function auditStatusChanges(
  adminId: string,
  before: Pick<Place, "publicationStatus" | "verificationStatus" | "archivedAt">,
  after: Place
) {
  const changes: Array<[AdminAuditAction, boolean]> = [
    ["place.published", before.publicationStatus !== "published" && after.publicationStatus === "published"],
    ["place.unpublished", before.publicationStatus === "published" && after.publicationStatus !== "published"],
    ["place.verified", before.verificationStatus !== "verified" && after.verificationStatus === "verified"],
    ["place.unverified", before.verificationStatus === "verified" && after.verificationStatus !== "verified"],
  ];
  for (const [action, happened] of changes) {
    if (!happened) continue;
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
    redirect(
      `/admin/places/new?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`
    );
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
      const params = new URLSearchParams({ duplicates: "1" });
      for (const key of PLACE_FORM_FIELDS) {
        const value = formData.get(key);
        if (typeof value === "string" && value !== "") params.set(key, value);
      }
      redirect(`/admin/places/new?${params.toString()}`);
    }
  }

  const evidence = priceEvidence(parsed.data, null, new Date());
  if ("error" in evidence) {
    redirect(`/admin/places/new?error=${encodeURIComponent(evidence.error)}`);
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
  redirect("/admin/places");
}

export async function updatePlaceAction(id: string, formData: FormData) {
  const admin = await requireAdmin();

  const parsed = parsePlaceForm(formData);
  if (!parsed.success) {
    redirect(
      `/admin/places/${id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`
    );
  }

  const before = await findPlaceById(id);
  const evidence = priceEvidence(parsed.data, before, new Date());
  if ("error" in evidence) {
    redirect(`/admin/places/${id}?error=${encodeURIComponent(evidence.error)}`);
  }

  let after: Place | null = null;
  try {
    after = await updatePlace(id, {
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
  } catch (error) {
    // places_archived_not_published_check: an archived place can't be published.
    if (hasPgErrorCode(error, PG_CHECK_VIOLATION)) {
      redirect(
        `/admin/places/${id}?error=${encodeURIComponent("This place is archived, so it can't be published. Unarchive it first, then publish.")}`
      );
    }
    throw error;
  }

  if (before && after) await auditStatusChanges(admin.id, before, after);

  revalidatePath("/admin/places");
  redirect("/admin/places");
}

/**
 * Deleting a Place that has partnership/facility history is blocked by the
 * database (ON DELETE RESTRICT) — archive it instead. The FK violation is
 * caught and turned into a clear message rather than a 500.
 */
export async function deletePlaceAction(formData: FormData) {
  const admin = await requireAdmin();

  const id = formData.get("id");
  if (typeof id === "string" && id) {
    const before = await findPlaceById(id);
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
  redirect("/admin/places");
}

async function archiveChange(formData: FormData, archived: boolean) {
  const admin = await requireAdmin();
  const id = formData.get("id");
  if (typeof id === "string" && id) {
    const before = await findPlaceById(id);
    const after = await setPlaceArchived(id, archived);
    if (before && after) {
      await recordAdminAudit({
        actorUserId: admin.id,
        action: archived ? "place.archived" : "place.unarchived",
        targetType: "place",
        targetId: id,
        before: statusSnapshot(before),
        after: statusSnapshot(after),
      });
    }
  }
  revalidatePath("/admin/places");
  redirect("/admin/places");
}

export async function archivePlaceAction(formData: FormData) {
  return archiveChange(formData, true);
}

export async function unarchivePlaceAction(formData: FormData) {
  return archiveChange(formData, false);
}
