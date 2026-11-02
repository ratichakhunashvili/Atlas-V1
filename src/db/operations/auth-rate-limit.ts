import { and, count, eq, gte, lt } from "drizzle-orm";
import { authRateLimitAttempts, type AuthRateLimitScope } from "@/db/schema";
import { authWindowStart, isWithinAuthLimit } from "@/services/rate-limit/auth-policy";
import type { AtlasDatabase } from "./types";

/*
 * Counting and recording sign-in / sign-up attempts. Takes the database handle as an argument so
 * the PGlite tests run this exact code.
 */

type Input = { scope: AuthRateLimitScope; keyHash: string; now: Date };

/** Whether another attempt is allowed, without recording one. */
export async function isAuthAttemptAllowed(db: AtlasDatabase, input: Input): Promise<boolean> {
  const [row] = await db
    .select({ attempts: count() })
    .from(authRateLimitAttempts)
    .where(
      and(
        eq(authRateLimitAttempts.keyHash, input.keyHash),
        eq(authRateLimitAttempts.scope, input.scope),
        gte(authRateLimitAttempts.occurredAt, authWindowStart(input.scope, input.now))
      )
    );
  return isWithinAuthLimit(input.scope, row?.attempts ?? 0);
}

/** Records one attempt and drops this key's rows that have left the window, so the table stays small. */
export async function recordAuthAttempt(db: AtlasDatabase, input: Input): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(authRateLimitAttempts)
      .where(
        and(
          eq(authRateLimitAttempts.keyHash, input.keyHash),
          eq(authRateLimitAttempts.scope, input.scope),
          lt(authRateLimitAttempts.occurredAt, authWindowStart(input.scope, input.now))
        )
      );
    await tx.insert(authRateLimitAttempts).values({ scope: input.scope, keyHash: input.keyHash, occurredAt: input.now });
  });
}
