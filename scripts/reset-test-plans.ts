import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

/*
 * Deletes today's-plan data for the TEST guest accounts only (emails ending in @atlas.test with role "user"), so the
 * daily "choose 1 of 3" flow can be tried again. Stops are removed with their day (ON DELETE CASCADE).
 * Never touches any other account. Refuses to run with NODE_ENV=production.
 *
 *   npx tsx scripts/reset-test-plans.ts
 */
(async () => {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run in production.");
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const deleted = await sql`
      delete from itinerary_days
      where user_id in (select id from users where email like '%@atlas.test' and role = 'user')
      returning id`;
    console.log(`Deleted ${deleted.length} test-guest plan day(s).`);
  } finally {
    await sql.end();
  }
})();
