import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "@/db/schema";

/**
 * A database handle an operation can run against, whatever driver provided it.
 *
 * This is the seam that lets a test exercise the REAL operation: production
 * passes the postgres-js singleton from `@/db`, a test passes an in-memory
 * PGlite instance. Without it, a test can only re-implement the SQL and then
 * silently drift from the code it claims to cover.
 *
 * Modules under db/operations deliberately do NOT import `@/db` or
 * `server-only`, so they can be imported by a plain `node --test` run.
 */
export type AtlasDatabase = PgDatabase<
  PgQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;
