"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authorization";
import { findPlaceById } from "@/db/queries/places";
import { deleteArTarget, upsertArTarget } from "@/db/queries/place-ar-targets";
import { hasSufficientDetail } from "@/services/ar/hash";
import { arTargetIdSchema, arTargetSchema } from "./schema";

/**
 * AR target administration.
 *
 * Every action authorizes itself with `requireAdmin()`: a Server Function answers
 * a direct POST, so the admin layout's guard protects the screen and not the
 * mutation. The Place is re-read from the database rather than trusted from the
 * form.
 *
 * **No image is received here.** The form posts a 60-character hash that the
 * admin's own browser computed; there is no file field, nothing is uploaded, and
 * nothing is stored but the hash.
 */

const LIST_PATH = "/admin/ar-targets";

function back(outcome: { error: string } | { ok: string }): never {
  const query =
    "error" in outcome ? `error=${encodeURIComponent(outcome.error)}` : `ok=${encodeURIComponent(outcome.ok)}`;
  redirect(`${LIST_PATH}?${query}`);
}

export async function saveArTargetAction(formData: FormData) {
  const admin = await requireAdmin();

  const parsed = arTargetSchema.safeParse({
    placeId: formData.get("placeId") ?? "",
    targetHash: formData.get("targetHash") ?? "",
    description: formData.get("description") ?? undefined,
  });

  if (!parsed.success) {
    back({ error: parsed.error.issues[0]?.message ?? "Check the form and try again." });
  }

  /*
   * A reference with too little structure is refused OUTRIGHT, before anything is
   * stored. This is a security bound, not a quality preference: the distance
   * between an all-black capture and a target is exactly the target's set-bit
   * count, so a featureless reference — open sky, a blank wall, an out-of-focus
   * blur — would be matched by a guest holding a thumb over the camera.
   */
  const detail = hasSufficientDetail(parsed.data.targetHash);
  if (!detail.ok) {
    back({
      error:
        "That image doesn't have enough detail to be a reliable reference. Photograph the Place itself — a building with edges and outlines — rather than a plain wall, the sky, or a blurred shot.",
    });
  }

  const place = await findPlaceById(parsed.data.placeId);
  if (!place) back({ error: "That place no longer exists." });

  await upsertArTarget({
    placeId: place.id,
    targetHash: parsed.data.targetHash,
    description: parsed.data.description?.length ? parsed.data.description : null,
    createdByUserId: admin.id,
  });

  revalidatePath(LIST_PATH);
  back({ ok: `Camera reference saved for ${place.name}.` });
}

export async function deleteArTargetAction(formData: FormData) {
  await requireAdmin();

  const id = arTargetIdSchema.safeParse(formData.get("id") ?? "");
  if (!id.success) back({ error: "That reference no longer exists." });

  const removed = await deleteArTarget(id.data);
  if (!removed) back({ error: "That reference no longer exists." });

  revalidatePath(LIST_PATH);
  /*
   * Worth being explicit with the admin: removing a target stops FUTURE camera
   * check-ins and does nothing to the past. Visits already recorded by AR stay
   * exactly as they are — permanent history is not editable from here.
   */
  back({ ok: "Camera reference removed. Visits already recorded are unaffected." });
}
