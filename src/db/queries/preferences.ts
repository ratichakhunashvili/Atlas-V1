import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userPreferences, type ActivityLevel, type BudgetLevel } from "@/db/schema";

export type PreferencesInput = {
  categories: string[];
  budget: BudgetLevel | null;
  activityLevel: ActivityLevel | null;
  maxDistanceMeters: number | null;
};

export async function findPreferencesForUser(userId: string) {
  const [row] = await db
    .select()
    .from(userPreferences)
    .where(eq(userPreferences.userId, userId))
    .limit(1);
  return row ?? null;
}

export async function upsertPreferences(userId: string, input: PreferencesInput) {
  const [row] = await db
    .insert(userPreferences)
    .values({ userId, ...input, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userPreferences.userId,
      set: { ...input, updatedAt: new Date() },
    })
    .returning();
  return row;
}
