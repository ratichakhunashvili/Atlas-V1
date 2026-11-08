"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authorization";
import { findPlaceById } from "@/db/queries/places";
import { recordAdminAudit } from "@/db/queries/admin-audit";
import {
  deletePlaceModel,
  findModelById,
  updateModelSettings,
  upsertPlaceModel,
} from "@/db/queries/place-models";
import { STORAGE_NOT_CONFIGURED_MESSAGE } from "@/services/storage";
import { storageService } from "@/services/storage/server";
import { isOwnModelUrl, modelStorageKey, validateModelShape } from "@/services/map3d";
import { anchorSeparationMeters, validateAnchor } from "@/services/map3d/placement";
import { modelIdSchema, modelSettingsSchema, placeIdSchema } from "./schema";

/**
 * Model administration.
 *
 * Every action authorizes itself: a Server Function answers a direct POST, so the
 * admin layout's guard protects the screen and not the mutation. The Place is read
 * from the database rather than trusted from the form, and the file is validated
 * before anything is stored.
 *
 * NOTHING here writes to a Place. A model's anchor and transform are display
 * fields on the model row; the linked Place's own coordinates stay authoritative
 * for eligibility, navigation, check-in and the achievement (see
 * db/operations/place-model-settings.ts, which has no Place column to write).
 */

const LIST_PATH = "/admin/models";

function back(outcome: { error: string } | { ok: string }): never {
  const query =
    "error" in outcome ? `error=${encodeURIComponent(outcome.error)}` : `ok=${encodeURIComponent(outcome.ok)}`;
  redirect(`${LIST_PATH}?${query}`);
}

/**
 * Attaches a model the admin's browser has just uploaded straight to the store (see app/api/admin/models/upload).
 *
 * The browser only reports a URL, and that is a claim: it must be this Place's own model path in Atlas's store, and
 * the store's own record of the file (its size, type and first four bytes) must pass the same checks a server-side
 * upload would. A file that fails is deleted again, and no model row is written.
 */
export async function attachUploadedModelAction(formData: FormData) {
  const admin = await requireAdmin();

  const placeId = placeIdSchema.safeParse(formData.get("placeId") ?? "");
  if (!placeId.success) back({ error: "Choose a place." });

  const place = await findPlaceById(placeId.data);
  if (!place) back({ error: "That place no longer exists." });

  if (!storageService.configured) back({ error: STORAGE_NOT_CONFIGURED_MESSAGE });

  const url = String(formData.get("url") ?? "");
  if (!isOwnModelUrl(url, place.id)) {
    // Admin-only screen: naming the address the store returned is what makes a mismatch fixable.
    back({ error: `That upload doesn't belong to ${place.name} (the store returned ${url || "no address"}). Upload the file again.` });
  }

  const stored = await storageService.inspect(url);
  if (!stored) back({ error: "The uploaded file couldn't be found in storage. Upload it again." });

  const validation = validateModelShape(stored);
  if (!validation.ok) {
    await storageService.delete(stored.key);
    back({ error: validation.message });
  }

  // Make it light enough to appear on a phone at once. If compression fails, the checked original is used as is.
  const file = (await compressStoredModel(place.id, stored)) ?? stored;

  const saved = await upsertPlaceModel({
    placeId: place.id,
    storageKey: file.key,
    fileUrl: file.url,
    fileSizeBytes: file.size,
    contentType: stored.contentType,
    uploadedByUserId: admin.id,
  });

  await recordAdminAudit({
    actorUserId: admin.id,
    action: "model.saved",
    targetType: "place_model",
    targetId: saved.id,
    // The storage key and URL are privileged/irrelevant here: the trail records that a file was attached, not where it lives.
    after: { placeId: place.id, uploaded: true, uploadedBytes: stored.size, fileSizeBytes: file.size, status: saved.status },
  });

  revalidatePath(LIST_PATH);
  const megabytes = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
  back({
    ok:
      file === stored
        ? `Model uploaded for ${place.name}, but it couldn't be compressed, so it may load slowly. It stays a draft until you enable it.`
        : `Model uploaded for ${place.name} and compressed from ${megabytes(stored.size)} MB to ${megabytes(file.size)} MB. It stays a draft until you enable it.`,
  });
}

/**
 * Replaces a freshly uploaded model with a compressed copy (see services/map3d/optimize). The copy is stored under the
 * same Place's model path, and the original is deleted once the copy is safely stored, so no unused file is left.
 * Returns null — keeping the original — when anything fails.
 */
async function compressStoredModel(
  placeId: string,
  stored: { key: string; url: string; size: number; contentType: string },
  options: { deleteOriginal: boolean } = { deleteOriginal: true }
): Promise<{ key: string; url: string; size: number } | null> {
  try {
    const { optimizeModel } = await import("@/services/map3d/optimize");
    const response = await fetch(stored.url, { cache: "no-store" });
    if (!response.ok) return null;
    const optimized = await optimizeModel(new Uint8Array(await response.arrayBuffer()));
    if (optimized.byteLength === 0 || optimized.byteLength >= stored.size) return null;

    const uploaded = await storageService.upload({ data: optimized, key: modelStorageKey(placeId), contentType: stored.contentType });
    if (!uploaded.ok) return null;
    if (options.deleteOriginal) await storageService.delete(stored.key);
    return { key: uploaded.key, url: uploaded.url, size: optimized.byteLength };
  } catch (error) {
    console.error("[models] compression failed", error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Compresses a model that is already attached, keeping its placement and status. For models uploaded before uploads
 * were compressed automatically; the row is switched to the compressed file, then the old file is deleted.
 */
export async function compressModelAction(formData: FormData) {
  const admin = await requireAdmin();

  const id = modelIdSchema.safeParse(formData.get("id") ?? "");
  if (!id.success) back({ error: "Model not found." });

  const existing = await findModelById(id.data);
  if (!existing) back({ error: "Model not found." });
  if (!storageService.configured) back({ error: STORAGE_NOT_CONFIGURED_MESSAGE });

  const before = existing.fileSizeBytes;
  const file = await compressStoredModel(existing.placeId, {
    key: existing.storageKey,
    url: existing.fileUrl,
    size: existing.fileSizeBytes,
    contentType: existing.contentType,
  }, { deleteOriginal: false });
  if (!file) back({ error: "This model couldn't be compressed further. It is unchanged." });

  await upsertPlaceModel({
    placeId: existing.placeId,
    storageKey: file.key,
    fileUrl: file.url,
    fileSizeBytes: file.size,
    contentType: existing.contentType,
    uploadedByUserId: admin.id,
  });
  // Only now that nothing points at it.
  await storageService.delete(existing.storageKey);

  await recordAdminAudit({
    actorUserId: admin.id,
    action: "model.saved",
    targetType: "place_model",
    targetId: existing.id,
    before: { fileSizeBytes: before },
    after: { compressed: true, fileSizeBytes: file.size },
  });

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${existing.id}`);
  const megabytes = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);
  back({ ok: `Compressed from ${megabytes(before)} MB to ${megabytes(file.size)} MB. Placement and status are unchanged.` });
}

export async function updateModelSettingsAction(modelId: string, formData: FormData) {
  const admin = await requireAdmin();

  const id = modelIdSchema.safeParse(modelId);
  if (!id.success) back({ error: "Model not found." });

  const existing = await findModelById(id.data);
  if (!existing) back({ error: "Model not found." });

  const editorPath = `${LIST_PATH}/${existing.id}`;
  const fail = (message: string): never => redirect(`${editorPath}?error=${encodeURIComponent(message)}`);

  /*
   * The save buttons carry the status ("Save as draft" / "Publish"), so which one was pressed decides it. Anything
   * else falls back to the form's own status field, and finally to the model's current status — never to "enabled"
   * by accident.
   */
  const parsed = modelSettingsSchema.safeParse({
    status: formData.get("status") ?? existing.status,
    targetHeightMeters: formData.get("targetHeightMeters") ?? "",
    rotationDegrees: formData.get("rotationDegrees") ?? "",
    pitchDegrees: formData.get("pitchDegrees") ?? "0",
    rollDegrees: formData.get("rollDegrees") ?? "0",
    elevationOffsetMeters: formData.get("elevationOffsetMeters") ?? "",
    scale: formData.get("scale") ?? "",
    scaleX: formData.get("scaleX") ?? "1",
    scaleY: formData.get("scaleY") ?? "1",
    scaleZ: formData.get("scaleZ") ?? "1",
    floating: formData.get("floating"),
    anchorLatitude: formData.get("anchorLatitude") ?? "",
    anchorLongitude: formData.get("anchorLongitude") ?? "",
    confirmLargeSeparation: formData.get("confirmLargeSeparation"),
  });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid input");
  const { confirmLargeSeparation, ...settings } = parsed.data!;

  // The linked Place is read from the database, never from the form: the anchor is judged against ITS real location.
  const place = await findPlaceById(existing.placeId);
  if (!place) fail("The place this model belongs to no longer exists.");

  const anchorCheck = validateAnchor({
    anchorLatitude: settings.anchorLatitude,
    anchorLongitude: settings.anchorLongitude,
    place: { latitude: place!.latitude, longitude: place!.longitude },
    confirmedLargeSeparation: confirmLargeSeparation,
  });
  if (!anchorCheck.ok) fail(anchorCheck.message);

  const saved = await updateModelSettings(existing.id, settings);
  if (!saved) fail("Model not found.");

  const action =
    existing.status !== "enabled" && settings.status === "enabled"
      ? "model.enabled"
      : existing.status === "enabled" && settings.status !== "enabled"
        ? "model.disabled"
        : "model.saved";

  await recordAdminAudit({
    actorUserId: admin.id,
    action,
    targetType: "place_model",
    targetId: existing.id,
    before: {
      status: existing.status,
      anchorLatitude: existing.anchorLatitude,
      anchorLongitude: existing.anchorLongitude,
      rotationDegrees: existing.rotationDegrees,
      elevationOffsetMeters: existing.elevationOffsetMeters,
      floating: existing.floating,
    },
    after: {
      status: saved!.status,
      anchorLatitude: saved!.anchorLatitude,
      anchorLongitude: saved!.anchorLongitude,
      rotationDegrees: saved!.rotationDegrees,
      elevationOffsetMeters: saved!.elevationOffsetMeters,
      floating: saved!.floating,
      displacementMeters: Math.round(anchorSeparationMeters(saved!, { latitude: place!.latitude, longitude: place!.longitude })),
    },
  });

  revalidatePath(LIST_PATH);
  revalidatePath(editorPath);
  // Stay in the editor: placement is iterative, and the admin usually wants to keep adjusting.
  redirect(
    `${editorPath}?ok=${encodeURIComponent(
      settings.status === "enabled" ? "Published — guests whose hotel has approved this place can see it now." : "Saved as a draft. Guests cannot see it."
    )}`
  );
}

export async function deletePlaceModelAction(formData: FormData) {
  const admin = await requireAdmin();

  const id = modelIdSchema.safeParse(formData.get("id") ?? "");
  if (!id.success) back({ error: "Model not found." });

  const existing = await findModelById(id.data);
  if (!existing) back({ error: "Model not found." });

  const removed = await deletePlaceModel(existing.id);

  /*
   * The stored file is removed too, but only after the row is gone: an orphaned
   * file costs storage, while a row pointing at a deleted file breaks the map. If
   * no store is configured the delete simply reports that, and the row is still
   * gone — the model stops being drawn either way.
   */
  if (removed) {
    await storageService.delete(removed.storageKey);
    await recordAdminAudit({
      actorUserId: admin.id,
      action: "model.deleted",
      targetType: "place_model",
      targetId: removed.id,
      before: { placeId: removed.placeId, status: removed.status },
    });
  }

  revalidatePath(LIST_PATH);
  back({ ok: "Model removed. The Place itself is untouched." });
}
