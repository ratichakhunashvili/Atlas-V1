import { and, eq, sql } from "drizzle-orm";
import {
  achievementUnlocks,
  achievements,
  placeVisits,
  type Achievement,
  type CheckInMethod,
  type PlaceVisit,
} from "@/db/schema";
import type { AtlasDatabase } from "./types";

/**
 * Turning a verified arrival into permanent history.
 *
 * Called only after a check-in has actually been accepted and written — every
 * ownership, stay, day, order, method and eligibility rule has already passed at
 * that point. Nothing here re-decides any of that; it records what the check-in
 * concluded. A refused check-in never reaches this function, which is what keeps
 * "a failed check-in creates no visit" true by construction rather than by a flag.
 *
 * Takes the database handle as an argument and imports neither `@/db` nor
 * `server-only`, so the PGlite tests exercise this exact code.
 */

export type RecordVisitResult = {
  visit: PlaceVisit;
  /** True only the first time: the visit that earned the badge, not any later one. */
  unlockedAchievement: Achievement | null;
  /** True when this arrival created the visit row rather than updating it. */
  firstVisit: boolean;
};

/**
 * Records one verified arrival, and unlocks the Place's badge if it has one and
 * the guest has not already earned it.
 *
 * Idempotent in both halves, and both by DATABASE CONSTRAINT rather than by
 * reading first and hoping:
 *
 *  - the visit is an upsert on `(user_id, place_id)`, so a second arrival bumps
 *    the count and the last-visited time instead of forking the history;
 *  - the unlock is an insert that does nothing on conflict, so a Place visited
 *    five times still yields one badge, earned once, at the time it was earned.
 *
 * Both run in one transaction: a visit without its unlock, or an unlock pointing
 * at a visit that was rolled back, would both be wrong.
 */
export async function recordVerifiedVisit(
  db: AtlasDatabase,
  input: { userId: string; placeId: string; method: CheckInMethod; now: Date }
): Promise<RecordVisitResult> {
  return db.transaction(async (tx) => {
    const [visit] = await tx
      .insert(placeVisits)
      .values({
        userId: input.userId,
        placeId: input.placeId,
        firstVisitedAt: input.now,
        lastVisitedAt: input.now,
        visitCount: 1,
        firstVerificationMethod: input.method,
      })
      .onConflictDoUpdate({
        target: [placeVisits.userId, placeVisits.placeId],
        set: {
          lastVisitedAt: input.now,
          visitCount: sql`${placeVisits.visitCount} + 1`,
        },
      })
      .returning();

    const firstVisit = visit.visitCount === 1;

    // Does this Place have a badge at all? Most do not.
    const [achievement] = await tx
      .select()
      .from(achievements)
      .where(eq(achievements.placeId, input.placeId))
      .limit(1);

    if (!achievement) {
      return { visit, unlockedAchievement: null, firstVisit };
    }

    const inserted = await tx
      .insert(achievementUnlocks)
      .values({
        userId: input.userId,
        achievementId: achievement.id,
        placeVisitId: visit.id,
        verificationMethod: input.method,
        unlockedAt: input.now,
      })
      // Already earned: keep the original unlock, its original time and its original
      // evidence. Returning nothing here is also what stops the celebration repeating.
      .onConflictDoNothing({ target: [achievementUnlocks.userId, achievementUnlocks.achievementId] })
      .returning();

    return {
      visit,
      unlockedAchievement: inserted.length > 0 ? achievement : null,
      firstVisit,
    };
  });
}

/** One guest's permanent visit history, newest arrival first. Scoped to them by argument — never a filter the caller may forget. */
export async function listPlaceVisitsForUser(db: AtlasDatabase, userId: string) {
  return db
    .select()
    .from(placeVisits)
    .where(eq(placeVisits.userId, userId))
    .orderBy(sql`${placeVisits.lastVisitedAt} desc`);
}

/** One guest's earned badges, newest first. */
export async function listAchievementUnlocksForUser(db: AtlasDatabase, userId: string) {
  return db
    .select({ unlock: achievementUnlocks, achievement: achievements })
    .from(achievementUnlocks)
    .innerJoin(achievements, eq(achievementUnlocks.achievementId, achievements.id))
    .where(eq(achievementUnlocks.userId, userId))
    .orderBy(sql`${achievementUnlocks.unlockedAt} desc`);
}

/** Whether this guest has a verified visit to this Place — the one source of truth for a Place's locked/unlocked state. */
export async function hasVisitedPlace(db: AtlasDatabase, userId: string, placeId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: placeVisits.id })
    .from(placeVisits)
    .where(and(eq(placeVisits.userId, userId), eq(placeVisits.placeId, placeId)))
    .limit(1);

  return row !== undefined;
}
