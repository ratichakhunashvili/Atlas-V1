import { count, eq } from "drizzle-orm";
import { achievementUnlocks, achievements, type Achievement } from "@/db/schema";
import type { AtlasDatabase } from "./types";

/**
 * Administering badges without destroying the record of who earned them.
 *
 * Injectable and free of `@/db` / `server-only`, so the PGlite tests call this
 * exact code rather than a copy of its SQL.
 */

/** How many guests have earned this badge. Zero means it is safe to delete outright. */
export async function countUnlocksForAchievement(db: AtlasDatabase, achievementId: string): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(achievementUnlocks)
    .where(eq(achievementUnlocks.achievementId, achievementId));

  return row?.value ?? 0;
}

export type DeleteAchievementResult =
  | { status: "deleted" }
  | { status: "has_unlocks"; unlocks: number }
  | { status: "not_found" };

/**
 * Deletes a badge only while nobody has earned it.
 *
 * An earned badge is somebody's history, and the unlock row points at the visit
 * that justified it. Removing the achievement would either orphan or cascade away
 * that evidence, so this refuses instead — and the schema refuses too
 * (`achievement_unlocks.achievement_id` is RESTRICT), which means the guarantee
 * survives even if this function is bypassed.
 *
 * Counting and deleting happen in one transaction so a badge cannot be earned in
 * the gap between the two.
 */
export async function deleteAchievementIfUnearned(
  db: AtlasDatabase,
  achievementId: string
): Promise<DeleteAchievementResult> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(achievements).where(eq(achievements.id, achievementId)).limit(1);
    if (!existing) return { status: "not_found" };

    const unlocks = await countUnlocksForAchievement(tx as AtlasDatabase, achievementId);
    if (unlocks > 0) return { status: "has_unlocks", unlocks };

    await tx.delete(achievements).where(eq(achievements.id, achievementId));
    return { status: "deleted" };
  });
}

/** Every badge with its Place and how many guests have earned it, for the admin list. */
export async function listAchievementsWithUsage(db: AtlasDatabase) {
  const { places } = await import("@/db/schema");

  return db
    .select({
      achievement: achievements,
      placeName: places.name,
      placeArchivedAt: places.archivedAt,
      unlocks: count(achievementUnlocks.id),
    })
    .from(achievements)
    .innerJoin(places, eq(achievements.placeId, places.id))
    .leftJoin(achievementUnlocks, eq(achievementUnlocks.achievementId, achievements.id))
    .groupBy(achievements.id, places.name, places.archivedAt)
    .orderBy(places.name);
}

export type AdminAchievementRow = Awaited<ReturnType<typeof listAchievementsWithUsage>>[number];

export async function findAchievement(db: AtlasDatabase, id: string): Promise<Achievement | null> {
  const [row] = await db.select().from(achievements).where(eq(achievements.id, id)).limit(1);
  return row ?? null;
}
