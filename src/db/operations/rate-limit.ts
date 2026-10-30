import { and, count, eq, gte, lt } from "drizzle-orm";
import { rateLimitAttempts, type RateLimitScope } from "@/db/schema";
import { RATE_LIMIT_RULES, isWithinLimit, windowStart } from "@/services/rate-limit/policy";
import type { AtlasDatabase } from "./types";

/**
 * Recording and counting attempts.
 *
 * Takes the database handle as an argument and imports neither `@/db` nor
 * `server-only`, so the PGlite tests exercise this exact code rather than a copy
 * of its SQL.
 */

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/**
 * Reserves one attempt: counts what already falls inside the rolling window and,
 * if there is room, records this attempt — both inside one transaction.
 *
 * Used for scopes that count EVERY operation, where the work itself is the thing
 * being limited. Doing the count and the insert together means two requests
 * arriving at once cannot both read "9 so far" and both proceed.
 *
 * Honest limit: this relies on the transaction, not on row locking, so under
 * genuinely parallel load at the exact boundary a request could still slip
 * through. For a throttle whose purpose is to stop loops and brute force, being
 * off by one at the edge is acceptable; it would not be acceptable for anything
 * that must be exact, and nothing here is.
 */
export async function reserveAttempt(
  db: AtlasDatabase,
  input: { scope: RateLimitScope; actorId: string; now: Date }
): Promise<RateLimitDecision> {
  return db.transaction(async (tx) => {
    const since = windowStart(input.scope, input.now);

    const [row] = await tx
      .select({ attempts: count() })
      .from(rateLimitAttempts)
      .where(
        and(
          eq(rateLimitAttempts.actorId, input.actorId),
          eq(rateLimitAttempts.scope, input.scope),
          gte(rateLimitAttempts.occurredAt, since)
        )
      );

    const attempts = row?.attempts ?? 0;
    if (!isWithinLimit(input.scope, attempts)) {
      return { allowed: false, retryAfterSeconds: RATE_LIMIT_RULES[input.scope].windowSeconds };
    }

    await tx
      .insert(rateLimitAttempts)
      .values({ scope: input.scope, actorId: input.actorId, occurredAt: input.now });

    return { allowed: true };
  });
}

/**
 * Checks without recording, for scopes that count only FAILURES: whether this
 * attempt counts is not known until it has been tried, so the caller records it
 * afterwards with `recordFailedAttempt`.
 *
 * Two simultaneous requests can therefore both see the same count and both
 * proceed. That is deliberate: the alternative is charging a guest for a check-in
 * that then succeeds, which would throttle them for using the product correctly.
 */
export async function checkAttemptAllowed(
  db: AtlasDatabase,
  input: { scope: RateLimitScope; actorId: string; now: Date }
): Promise<RateLimitDecision> {
  const since = windowStart(input.scope, input.now);

  const [row] = await db
    .select({ attempts: count() })
    .from(rateLimitAttempts)
    .where(
      and(
        eq(rateLimitAttempts.actorId, input.actorId),
        eq(rateLimitAttempts.scope, input.scope),
        gte(rateLimitAttempts.occurredAt, since)
      )
    );

  const attempts = row?.attempts ?? 0;
  return isWithinLimit(input.scope, attempts)
    ? { allowed: true }
    : { allowed: false, retryAfterSeconds: RATE_LIMIT_RULES[input.scope].windowSeconds };
}

/** Records one refused attempt. Called only after an attempt has actually failed. */
export async function recordFailedAttempt(
  db: AtlasDatabase,
  input: { scope: RateLimitScope; actorId: string; now: Date }
): Promise<void> {
  await db
    .insert(rateLimitAttempts)
    .values({ scope: input.scope, actorId: input.actorId, occurredAt: input.now });
}

/**
 * Drops attempts that have aged out of their window.
 *
 * Called opportunistically rather than on a schedule: without it the table only
 * ever grows, and rows older than the window can never affect a decision again.
 * Scoped to the one actor so it stays a small, indexed delete.
 */
export async function pruneExpiredAttempts(
  db: AtlasDatabase,
  input: { scope: RateLimitScope; actorId: string; now: Date }
): Promise<void> {
  await db
    .delete(rateLimitAttempts)
    .where(
      and(
        eq(rateLimitAttempts.actorId, input.actorId),
        eq(rateLimitAttempts.scope, input.scope),
        lt(rateLimitAttempts.occurredAt, windowStart(input.scope, input.now))
      )
    );
}
