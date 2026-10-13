import { config } from "dotenv";
config({ path: ".env.local" });

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users } from "./schema";

// Explicit, manual admin promotion — the opposite of "first user becomes
// admin." Run with: npm run db:seed:admin -- someone@example.com
async function main() {
  const email = process.argv[2] ?? process.env.ADMIN_EMAIL;
  if (!email) {
    throw new Error(
      "Provide an email: npm run db:seed:admin -- someone@example.com"
    );
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local and fill it in."
    );
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  const [user] = await db
    .update(users)
    .set({ role: "admin", updatedAt: new Date() })
    .where(eq(users.email, email))
    .returning();

  await client.end();

  if (!user) {
    throw new Error(`No user found with email ${email}. Sign up first, then re-run this script.`);
  }

  console.log(`Promoted ${user.email} to admin.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
