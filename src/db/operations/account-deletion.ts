import { eq } from "drizzle-orm";
import { achievementUnlocks, users } from "@/db/schema";
import type { AtlasDatabase } from "./types";

/*
 * A guest deleting their own account. The caller (deleteAccountAction) decides who is acting; this decides what
 * happens to the data. Takes the database handle so the PGlite tests run this exact code.
 */

export type DeleteAccountResult = { ok: true } | { ok: false; reason: "not_found" | "admin_account" };

/**
 * Removes the account and everything personal hanging off it, in one transaction: stays, pending hotel switches,
 * preferences, plan days and stops, visits, badges and rate-limit records (their foreign keys cascade). Audit rows
 * an admin wrote keep their history with the actor set to null.
 *
 * Badges are deleted first because each one points at the visit that earned it with RESTRICT, which would
 * otherwise block the visits' cascade.
 *
 * Admin accounts are refused: losing the last admin would lock everyone out of the console, so an admin is
 * demoted by another admin first.
 */
export async function deleteGuestAccount(db: AtlasDatabase, userId: string): Promise<DeleteAccountResult> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return { ok: false, reason: "not_found" };
    if (user.role === "admin") return { ok: false, reason: "admin_account" };

    await tx.delete(achievementUnlocks).where(eq(achievementUnlocks.userId, userId));
    await tx.delete(users).where(eq(users.id, userId));
    return { ok: true };
  });
}
