import { sql } from "drizzle-orm";
import type { AtlasDatabase } from "./types";

/**
 * Stage A backfill (docs/guest-principal-plan.md): give every existing account exactly one principal, and point every
 * guest-owned row at its owner's principal. Idempotent and re-runnable — it only ever fills what is missing, never
 * rewrites a value that is already set, so running it twice (or after new users have signed up) is safe.
 *
 * It does NOT touch `user_id`, which remains the source of truth until Stage B. It is deliberately not part of the
 * schema migration: structure and data change at different speeds, and this can be re-run, verified and inspected on its
 * own.
 */

/** Each guest-owned table, and the column that currently holds its owner. */
export const PRINCIPAL_OWNED_TABLES = [
  { table: "hotel_stays", ownerColumn: "user_id" },
  { table: "user_preferences", ownerColumn: "user_id" },
  { table: "itinerary_days", ownerColumn: "user_id" },
  { table: "place_visits", ownerColumn: "user_id" },
  { table: "achievement_unlocks", ownerColumn: "user_id" },
  { table: "pending_hotel_switches", ownerColumn: "user_id" },
  { table: "rate_limit_attempts", ownerColumn: "actor_id" },
] as const;

type Rows<T> = T[];
function rowsOf<T>(result: unknown): Rows<T> {
  // postgres-js returns the rows directly, PGlite wraps them in { rows }: accept both.
  return (Array.isArray(result) ? result : (result as { rows: Rows<T> }).rows) as Rows<T>;
}

export async function backfillGuestPrincipals(db: AtlasDatabase) {
  return db.transaction(async (tx) => {
    const before = rowsOf<{ n: number }>(await tx.execute(sql`select count(*)::int as n from guest_principals`))[0].n;

    await tx.execute(sql`
      insert into guest_principals (user_id, created_at, linked_at)
      select u.id, u.created_at, u.created_at from users u
      on conflict (user_id) do nothing
    `);

    const after = rowsOf<{ n: number }>(await tx.execute(sql`select count(*)::int as n from guest_principals`))[0].n;

    for (const { table, ownerColumn } of PRINCIPAL_OWNED_TABLES) {
      // Only rows still missing a principal are written; an already-set value is never rewritten.
      await tx.execute(
        sql.raw(
          `update ${table} t set principal_id = p.id from guest_principals p where p.user_id = t.${ownerColumn} and t.principal_id is null`
        )
      );
    }

    return { principalsCreated: after - before };
  });
}

export type PrincipalBackfillReport = {
  usersWithoutPrincipal: number;
  tables: Array<{ table: string; missingPrincipal: number; principalDisagreesWithOwner: number }>;
  /** True only when every count is zero — the precondition for even proposing Stage B. */
  clean: boolean;
};

/** Read-only. Every count must be zero before Stage B is proposed. */
export async function verifyPrincipalBackfill(db: AtlasDatabase): Promise<PrincipalBackfillReport> {
  const usersWithoutPrincipal = rowsOf<{ n: number }>(
    await db.execute(sql`select count(*)::int as n from users u where not exists (select 1 from guest_principals p where p.user_id = u.id)`)
  )[0].n;

  const tables: PrincipalBackfillReport["tables"] = [];
  for (const { table, ownerColumn } of PRINCIPAL_OWNED_TABLES) {
    const missing = rowsOf<{ n: number }>(
      await db.execute(sql.raw(`select count(*)::int as n from ${table} where principal_id is null`))
    )[0].n;
    const disagree = rowsOf<{ n: number }>(
      await db.execute(
        sql.raw(
          `select count(*)::int as n from ${table} t join guest_principals p on p.id = t.principal_id where p.user_id is distinct from t.${ownerColumn}`
        )
      )
    )[0].n;
    tables.push({ table, missingPrincipal: missing, principalDisagreesWithOwner: disagree });
  }

  const clean = usersWithoutPrincipal === 0 && tables.every((entry) => entry.missingPrincipal === 0 && entry.principalDisagreesWithOwner === 0);
  return { usersWithoutPrincipal, tables, clean };
}
