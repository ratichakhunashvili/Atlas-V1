import { config } from "dotenv";
config({ path: ".env.local" });

import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { isLocalDatabaseUrl, seedDevFixtures, type SeedDevFixturesResult } from "./operations/dev-seed";
import * as schema from "./schema";

/*
 * Local development fixtures. Run with: npm run db:seed:dev
 *
 * These passwords are PUBLIC — they are written here in the repository on
 * purpose, so there is nothing to ask anyone to paste into a chat window. That
 * is exactly why this script refuses to run in production: an account with a
 * published password is harmless on a laptop and a breach anywhere else.
 *
 * The fixtures themselves (who they are, what they can see, and why) are
 * documented in db/operations/dev-seed.ts.
 */
const DEV_ADMIN_PASSWORD = "atlas-dev-admin";
const DEV_GUEST_PASSWORD = "atlas-dev-guest";

// Matches auth/password.ts. That module can't be imported here: it starts with
// `import "server-only"`, which throws outside Next's bundler.
const SALT_ROUNDS = 12;

async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed: NODE_ENV is production. These fixtures use passwords published in the repository."
    );
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  }

  /*
   * The host is the guard that matters, and it is checked BEFORE connecting.
   * NODE_ENV above is close to useless on its own: tsx leaves it unset, so a
   * DATABASE_URL pointing at a hosted or shared database would otherwise be
   * seeded with an admin account whose password is printed in the README.
   *
   * The URL is never echoed — saying which host was rejected would put a
   * connection string into a terminal log for no benefit.
   */
  const allowRemote = process.argv.includes("--allow-remote");
  if (!isLocalDatabaseUrl(connectionString) && !allowRemote) {
    throw new Error(
      "Refusing to seed: DATABASE_URL does not point at a database on this machine.\n" +
        "These fixtures include an admin account whose password is published in the README.\n" +
        "If you are certain the target is a throwaway database, re-run with: npm run db:seed:dev -- --allow-remote"
    );
  }
  if (allowRemote) {
    console.warn(
      "WARNING: seeding a non-local database at your request. The admin password below is public.\n"
    );
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client, { schema });

  let result: SeedDevFixturesResult;
  try {
    result = await seedDevFixtures(db, {
      adminPasswordHash: await bcrypt.hash(DEV_ADMIN_PASSWORD, SALT_ROUNDS),
      guestPasswordHash: await bcrypt.hash(DEV_GUEST_PASSWORD, SALT_ROUNDS),
    });
  } finally {
    await client.end();
  }

  console.log("Seeded local development fixtures.\n");
  console.log(`  Admin: ${result.adminEmail} / ${DEV_ADMIN_PASSWORD}`);
  console.log(`  Guest: ${result.guestEmail} / ${DEV_GUEST_PASSWORD}`);
  console.log(`  Fixture places: ${result.fixturePlaceCount}`);
  console.log(
    result.guestStayHotelPlaceId
      ? "  Guest has an active stay at Atlas Test Hotel A."
      : "  Guest already had a different active stay; it was left untouched."
  );
  console.log(
    "\nNo QR credentials were seeded. Issue one from the admin hotel or place screen — the raw code is shown once, there."
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
