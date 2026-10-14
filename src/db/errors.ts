/**
 * Drizzle wraps the real postgres error in a DrizzleQueryError, so the
 * SQLSTATE lives at `error.cause.code`, not `error.code` (see the same note in
 * db/queries/hotel-stays.ts). Checks both levels.
 */
export function hasPgErrorCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === code) return true;
  const cause = (error as { cause?: unknown }).cause;
  return typeof cause === "object" && cause !== null && "code" in cause && cause.code === code;
}

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";
export const PG_CHECK_VIOLATION = "23514";
