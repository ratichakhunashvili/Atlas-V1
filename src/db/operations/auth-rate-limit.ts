import { and, count, eq, gte, lt, sql } from "drizzle-orm";
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

/**
 * Counts and, if there is room, records one attempt atomically. A transaction-scoped advisory lock on (scope, key)
 * makes simultaneous requests for the same key queue, so a burst cannot all pass the count before any of them records
 * (follow-up review, 2026-11-13). Returns whether the attempt was allowed.
 */
export async function reserveAuthAttempt(db: AtlasDatabase, input: Input): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`auth-rate:${input.scope}:${input.keyHash}`}, 0))`);
    const [row] = await tx
      .select({ attempts: count() })
      .from(authRateLimitAttempts)
      .where(
        and(
          eq(authRateLimitAttempts.keyHash, input.keyHash),
          eq(authRateLimitAttempts.scope, input.scope),
          gte(authRateLimitAttempts.occurredAt, authWindowStart(input.scope, input.now))
        )
      );
    if (!isWithinAuthLimit(input.scope, row?.attempts ?? 0)) return false;
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
    return true;
  });
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
