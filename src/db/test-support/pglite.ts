import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "@/db/schema";

/**
 * An in-process Postgres for tests, created from the project's real checked-in
 * migrations. Approved 2026-10-14 (the PGlite deferral was lifted for tests only):
 * no Neon, no remote database, nothing applied anywhere but this throwaway
 * in-memory instance.
 *
 * What this buys that injected fakes cannot: proof that the CONSTRAINTS exist and
 * behave — partial unique indexes, CHECKs, foreign keys — and that the migrations
 * apply cleanly in order. A fake can only prove that our TypeScript believes a rule;
 * this proves the database enforces it even if the TypeScript is bypassed.
 *
 * What it still does NOT prove: PGlite runs one connection and serializes
 * statements, so a test here cannot demonstrate true parallel row locking. It does
 * demonstrate the conditional-UPDATE semantics those guards rely on.
 *
 * The db/queries/* modules themselves stay out of reach: each starts with
 * `import "server-only"`, which throws outside Next's bundler. Tests here therefore
 * exercise the schema and the exact SQL shapes those functions use.
 */
export async function createTestDatabase() {
  const client = new PGlite();
  const db = drizzle(client, { schema });

  await migrate(db, { migrationsFolder: "src/db/migrations" });

  return {
    db,
    schema,
    async close() {
      await client.close();
    },
  };
}

export type TestDatabase = Awaited<ReturnType<typeof createTestDatabase>>;

/** Asserts that a database operation fails, and returns the Postgres SQLSTATE so a test can name which rule rejected it. */
export async function expectSqlFailure(operation: () => Promise<unknown>): Promise<string> {
  try {
    await operation();
  } catch (error) {
    // Drizzle wraps the driver error; the SQLSTATE lives on the cause (see the
    // same unwrapping in db/queries/hotel-stays.ts).
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ?? (error as { code?: string }).code ?? "unknown";
  }
  throw new Error("Expected the operation to be rejected by the database, but it succeeded.");
}
