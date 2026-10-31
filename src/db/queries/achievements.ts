import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { achievements, type Achievement } from "@/db/schema";
import {
  countUnlocksForAchievement as countOperation,
  deleteAchievementIfUnearned as deleteOperation,
  findAchievement as findOperation,
  listAchievementsWithUsage as listOperation,
  type DeleteAchievementResult,
} from "@/db/operations/achievements";

/*
 * Reads and writes bound to the production handle. The guarded delete and the
 * usage counting live in db/operations/achievements.ts so the PGlite tests call
 * the real code.
 */

export type { DeleteAchievementResult };

export async function listAchievementsWithUsage() {
  return listOperation(db);
}

export async function findAchievement(id: string) {
  return findOperation(db, id);
}

export async function countUnlocksForAchievement(achievementId: string) {
  return countOperation(db, achievementId);
}

export async function deleteAchievementIfUnearned(achievementId: string) {
  return deleteOperation(db, achievementId);
}

/** The badge attached to one Place, if it has one. At most one exists (unique constraint). */
export async function findAchievementForPlace(placeId: string): Promise<Achievement | null> {
  const [row] = await db.select().from(achievements).where(eq(achievements.placeId, placeId)).limit(1);
  return row ?? null;
}

export async function createAchievement(input: {
  placeId: string;
  name: string;
  description: string | null;
  badgeImageUrl: string | null;
}): Promise<Achievement> {
  const [created] = await db.insert(achievements).values(input).returning();
  return created;
}

export async function updateAchievement(
  id: string,
  input: { name: string; description: string | null; badgeImageUrl: string | null }
): Promise<Achievement | null> {
  const [updated] = await db
    .update(achievements)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(achievements.id, id))
    .returning();

  return updated ?? null;
}

/**
 * Every place in the daily plan unlocks a badge. If an admin hasn't made one yet, a plain default is created
 * ("Visited <place>"), which the admin can rename or give an image later. Never overwrites an existing badge.
 */
export async function ensureDefaultAchievementForPlace(input: { placeId: string; placeName: string }): Promise<void> {
  await db
    .insert(achievements)
    .values({ placeId: input.placeId, name: `Visited ${input.placeName}`, description: null, badgeImageUrl: null })
    .onConflictDoNothing({ target: achievements.placeId });
}
