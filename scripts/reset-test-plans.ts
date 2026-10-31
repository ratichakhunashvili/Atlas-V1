import { config } from "dotenv";
config({ path: ".env.local" });
import postgres from "postgres";

/*
 * Deletes today's-plan data for the TEST guest accounts only (emails ending in @atlas.test, plus test@test.com, with role "user"), so the
 * daily "choose 1 of 3" flow can be tried again. Stops are removed with their day (ON DELETE CASCADE).
 * With --achievements it also clears those accounts' badges and visit history, so a FIRST unlock can be seen again.
 * Never touches any other account. Refuses to run with NODE_ENV=production.
 *
 *   npx tsx scripts/reset-test-plans.ts
 *   npx tsx scripts/reset-test-plans.ts --achievements
 */
(async () => {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to run in production.");
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
  try {
    const deleted = await sql`
      delete from itinerary_days
      where user_id in (select id from users where (email like '%@atlas.test' or email = 'test@test.com') and role = 'user')
      returning id`;
    console.log(`Deleted ${deleted.length} test-guest plan day(s).`);
    if (process.argv.includes("--achievements")) {
      const testGuests = sql`select id from users where (email like '%@atlas.test' or email = 'test@test.com') and role = 'user'`;
      const unlocks = await sql`delete from achievement_unlocks where user_id in (${testGuests}) returning id`;
      const visits = await sql`delete from place_visits where user_id in (${testGuests}) returning id`;
      console.log(`Deleted ${unlocks.length} test-guest badge unlock(s) and ${visits.length} visit record(s).`);
    }
  } finally {
    await sql.end();
  }
})();
