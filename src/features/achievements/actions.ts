"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authorization";
import {
  createAchievement,
  deleteAchievementIfUnearned,
  findAchievement,
  findAchievementForPlace,
  updateAchievement,
} from "@/db/queries/achievements";
import { findPlaceById } from "@/db/queries/places";
import { achievementIdSchema, createAchievementSchema, updateAchievementSchema } from "./schema";

/**
 * Badge administration.
 *
 * Every action authorizes itself — a Server Function answers a direct POST, so the
 * admin layout's guard protects the screen and not the mutation. Every id and
 * field is validated here, and the Place is re-read from the database rather than
 * trusted from the form.
 */

const LIST_PATH = "/admin/achievements";

function back(outcome: { error: string } | { ok: string }): never {
  const query =
    "error" in outcome
      ? `error=${encodeURIComponent(outcome.error)}`
      : `ok=${encodeURIComponent(outcome.ok)}`;
  redirect(`${LIST_PATH}?${query}`);
}

export async function createAchievementAction(formData: FormData) {
  await requireAdmin();

  const parsed = createAchievementSchema.safeParse({
    placeId: formData.get("placeId") ?? "",
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    badgeImageUrl: formData.get("badgeImageUrl") ?? "",
  });

  if (!parsed.success) back({ error: parsed.error.issues[0]?.message ?? "Invalid input" });

  // The Place must exist. Read it rather than trusting the id that arrived.
  const place = await findPlaceById(parsed.data.placeId);
  if (!place) back({ error: "That place no longer exists." });

  // A hotel is the origin of a route, not somewhere a guest checks in to earn a badge.
  if (place.category === "hotel") {
    back({ error: "A hotel's own Place can't carry a badge. Choose an experience instead." });
  }

  // One badge per Place. The unique constraint enforces it too; this is the
  // sentence the admin gets instead of a constraint error.
  const existing = await findAchievementForPlace(place.id);
  if (existing) back({ error: `${place.name} already has a badge. Edit the existing one instead.` });

  await createAchievement({
    placeId: place.id,
    name: parsed.data.name,
    description: parsed.data.description,
    badgeImageUrl: parsed.data.badgeImageUrl,
  });

  revalidatePath(LIST_PATH);
  back({ ok: `Badge created for ${place.name}.` });
}

export async function updateAchievementAction(achievementId: string, formData: FormData) {
  await requireAdmin();

  const id = achievementIdSchema.safeParse(achievementId);
  if (!id.success) back({ error: "Badge not found." });

  const existing = await findAchievement(id.data);
  if (!existing) back({ error: "Badge not found." });

  const parsed = updateAchievementSchema.safeParse({
    name: formData.get("name") ?? "",
    description: formData.get("description") ?? "",
    badgeImageUrl: formData.get("badgeImageUrl") ?? "",
  });

  if (!parsed.success) {
    redirect(`${LIST_PATH}/${existing.id}?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`);
  }

  /*
   * The Place is not editable. Moving a badge to a different Place would silently
   * rewrite what every guest who earned it actually did — their unlock points at a
   * visit to the ORIGINAL Place. A badge for somewhere else is a new badge.
   */
  await updateAchievement(existing.id, {
    name: parsed.data.name,
    description: parsed.data.description,
    badgeImageUrl: parsed.data.badgeImageUrl,
  });

  revalidatePath(LIST_PATH);
  revalidatePath(`${LIST_PATH}/${existing.id}`);
  back({ ok: "Badge updated." });
}

export async function deleteAchievementAction(formData: FormData) {
  await requireAdmin();

  const id = achievementIdSchema.safeParse(formData.get("id") ?? "");
  if (!id.success) back({ error: "Badge not found." });

  /*
   * Refused once anybody has earned it. An unlock is a guest's record of something
   * they did, and it points at the visit that proved it; deleting the badge would
   * either orphan that evidence or cascade it away. The schema refuses as well
   * (RESTRICT), so this is the explanation rather than the protection.
   *
   * There is no archive flag on achievements, so the honest options are "delete
   * while unearned" or "keep". Hiding an earned badge would need a schema change
   * and a product decision about what guests who hold it should then see.
   */
  const result = await deleteAchievementIfUnearned(id.data);

  if (result.status === "not_found") back({ error: "Badge not found." });
  if (result.status === "has_unlocks") {
    back({
      error: `This badge has been earned by ${result.unlocks} guest${result.unlocks === 1 ? "" : "s"} and can't be deleted. Their record of earning it stays.`,
    });
  }

  revalidatePath(LIST_PATH);
  back({ ok: "Badge deleted." });
}
