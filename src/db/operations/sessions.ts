import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import type { AtlasDatabase } from "./types";

/**
 * Ends every session of the account that was signed in before `now` (on every device), by moving
 * users.sessions_valid_after forward; lib/session-standing.ts is the rule that reads it. `now` comes from the app's
 * clock, the same clock that stamps a token's sign-in time, so database/app clock skew cannot decide the outcome.
 * Takes the database handle (or a transaction) so the PGlite tests run this exact code.
 */
export async function revokeUserSessions(db: AtlasDatabase, userId: string, now: Date): Promise<void> {
  await db.update(users).set({ sessionsValidAfter: now }).where(eq(users.id, userId));
}
