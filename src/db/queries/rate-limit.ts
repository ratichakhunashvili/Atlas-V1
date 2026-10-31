import "server-only";
import { db } from "@/db";
import type { RateLimitScope } from "@/db/schema";
import {
  checkAttemptAllowed as checkOperation,
  pruneExpiredAttempts as pruneOperation,
  recordFailedAttempt as recordOperation,
  reserveAttempt as reserveOperation,
  type RateLimitDecision,
} from "@/db/operations/rate-limit";

/*
 * Thin bindings of the production database handle. All logic lives in
 * db/operations/rate-limit.ts so the PGlite tests call the real operations.
 */

export type { RateLimitDecision };

export async function reserveAttempt(input: { scope: RateLimitScope; actorId: string; now: Date }) {
  return reserveOperation(db, input);
}

export async function checkAttemptAllowed(input: { scope: RateLimitScope; actorId: string; now: Date }) {
  return checkOperation(db, input);
}

export async function recordFailedAttempt(input: { scope: RateLimitScope; actorId: string; now: Date }) {
  return recordOperation(db, input);
}

export async function pruneExpiredAttempts(input: { scope: RateLimitScope; actorId: string; now: Date }) {
  return pruneOperation(db, input);
}
