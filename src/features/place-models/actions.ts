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
import { storageService } from "@/services/storage";
import { uploadModelFile } from "@/services/map3d";
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

export async function uploadPlaceModelAction(formData: FormData) {
  const admin = await requireAdmin();

  const placeId = placeIdSchema.safeParse(formData.get("placeId") ?? "");
  if (!placeId.success) back({ error: "Choose a place." });

  const place = await findPlaceById(placeId.data);
  if (!place) back({ error: "That place no longer exists." });

  const file = formData.get("model");
  if (!(file instanceof File) || file.size === 0) back({ error: "Choose a .glb model file." });

  /*
   * Read the bytes to validate them. Validation looks at the magic number and the
   * size — it never parses or executes the file, and nothing server-side renders
   * it: a GLB is handed to the browser's loader and nowhere else.
   */
  const bytes = new Uint8Array(await file.arrayBuffer());

  const result = await uploadModelFile(storageService, {
    placeId: place.id,
    bytes,
    contentType: file.type,
  });

  if (!result.ok) {
    /*
     * Includes the "no object store configured" case. The admin is told what is
     * missing and NO model row is written — a row pointing at a file that does not
     * exist would be worse than the refusal.
     */
    back({ error: result.message });
  }

  const saved = await upsertPlaceModel({
    placeId: place.id,
    storageKey: result.key,
    fileUrl: result.url,
    fileSizeBytes: bytes.byteLength,
    contentType: file.type,
    uploadedByUserId: admin.id,
  });

  await recordAdminAudit({
    actorUserId: admin.id,
    action: "model.saved",
    targetType: "place_model",
    targetId: saved.id,
    // The storage key and URL are privileged/irrelevant here: the trail records that a file was attached, not where it lives.
    after: { placeId: place.id, uploaded: true, fileSizeBytes: bytes.byteLength, status: saved.status },
  });

  revalidatePath(LIST_PATH);
  back({ ok: `Model uploaded for ${place.name}. It stays a draft until you enable it.` });
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
    },
    after: {
      status: saved!.status,
      anchorLatitude: saved!.anchorLatitude,
      anchorLongitude: saved!.anchorLongitude,
      rotationDegrees: saved!.rotationDegrees,
      elevationOffsetMeters: saved!.elevationOffsetMeters,
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
