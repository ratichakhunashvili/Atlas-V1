import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { backfillGuestPrincipals, verifyPrincipalBackfill } from "./operations/guest-principals";

/**
 * GuestPrincipal Stage A backfill (docs/guest-principal-plan.md).
 *
 *   npm run db:backfill:principals            -> read-only: prints what is missing, changes nothing
 *   npm run db:backfill:principals -- --apply -> fills what is missing, then re-verifies
 *
 * Runs against whatever DATABASE_URL points at — which may be a shared database — so the default is verify-only and
 * writing needs the explicit flag. It never prints the connection string.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");

  const apply = process.argv.includes("--apply");
  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    if (apply) {
      const result = await backfillGuestPrincipals(db);
      console.log(`Backfill applied. Principals created: ${result.principalsCreated}.`);
    } else {
      console.log("Verify-only (pass --apply to write).");
    }

    const report = await verifyPrincipalBackfill(db);
    console.log(`Accounts without a principal: ${report.usersWithoutPrincipal}`);
    for (const entry of report.tables) {
      console.log(`${entry.table}: missing principal ${entry.missingPrincipal}, disagrees with owner ${entry.principalDisagreesWithOwner}`);
    }
    console.log(report.clean ? "CLEAN: every count is zero." : "NOT CLEAN: see counts above.");
    process.exitCode = report.clean ? 0 : 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
