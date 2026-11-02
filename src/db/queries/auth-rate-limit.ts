import "server-only";
import { db } from "@/db";
import type { AuthRateLimitScope } from "@/db/schema";
import { isAuthAttemptAllowed as checkOperation, recordAuthAttempt as recordOperation } from "@/db/operations/auth-rate-limit";

/* Thin bindings of the production database handle; the logic is in db/operations/auth-rate-limit.ts. */

export async function isAuthAttemptAllowed(input: { scope: AuthRateLimitScope; keyHash: string; now: Date }) {
  return checkOperation(db, input);
}

export async function recordAuthAttempt(input: { scope: AuthRateLimitScope; keyHash: string; now: Date }) {
  return recordOperation(db, input);
}
