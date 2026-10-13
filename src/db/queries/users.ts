import "server-only";
import { eq, ilike } from "drizzle-orm";
import { db } from "@/db";
import { users, type User, type UserRole } from "@/db/schema";

export async function findUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  return user ?? null;
}

export async function findUserById(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}

export async function createUser(input: { email: string; passwordHash: string }) {
  const [user] = await db
    .insert(users)
    .values({ email: input.email, passwordHash: input.passwordHash })
    .returning();
  return user;
}

export async function setUserRole(email: string, role: UserRole) {
  const [user] = await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.email, email))
    .returning();
  return user ?? null;
}

/** Exact prefix match, `%`/`_` escaped so a caller's marker can never broaden the match — see the identical note on listPlacesByNamePrefix (db/queries/places.ts). Used by the Advisor test-scenario tool to list/find scenario users; never by any guest-facing feature. */
export async function listUsersByEmailPrefix(prefix: string): Promise<User[]> {
  const escaped = prefix.replace(/[\\%_]/g, (char) => `\\${char}`);
  return db.select().from(users).where(ilike(users.email, `${escaped}%`));
}

/** Cascades to hotel_stays/itinerary_days(->itinerary_stops)/user_preferences via their FK onDelete rules — see db/schema/* for each. Used by the Advisor test-scenario tool's cleanup; not exposed anywhere else (no guest-facing or admin-CRUD account deletion exists yet). */
export async function deleteUser(id: string) {
  await db.delete(users).where(eq(users.id, id));
}
