import { config } from "dotenv";
config({ path: ".env.local" });

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { isLocalDatabaseUrl } from "./operations/dev-seed";
import { GURJAANI_PILOT_PLACES, seedGurjaaniPilot } from "./operations/gurjaani-pilot";
import * as schema from "./schema";

/*
 * Adds the Gurjaani pilot: Techpark Gurjaani as a base and real places around it (db/operations/gurjaani-pilot.ts).
 * Run with: npm run db:seed:gurjaani
 *
 * Real data, unlike db:seed:dev, and no accounts or passwords. A database that is not on this machine is only
 * written with --live, so the live site is never changed by accident. Re-running adds nothing new.
 */
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");

  const live = !isLocalDatabaseUrl(connectionString);
  if (live && !process.argv.includes("--live")) {
    throw new Error("Refusing: DATABASE_URL is not on this machine. To add the pilot to that database, run: npm run db:seed:gurjaani -- --live");
  }

  const client = postgres(connectionString, { max: 1 });
  try {
    const result = await seedGurjaaniPilot(drizzle(client, { schema }));
    console.log(`Gurjaani pilot (${live ? "remote" : "local"} database):`);
    console.log(`  Techpark Gurjaani hotel: ${result.hotel ? "added" : "already there"}`);
    console.log(`  Places added: ${result.places} (of ${GURJAANI_PILOT_PLACES.length + 1})`);
    console.log(`  Pending Atlas contracts added: ${result.contracts}`);
    console.log("\nNext: issue Techpark's hotel QR code from its admin page, and confirm contracts only for real agreements.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
