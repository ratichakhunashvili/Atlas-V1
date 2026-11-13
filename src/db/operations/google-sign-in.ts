import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { userIdentities, users, type UserRole } from "@/db/schema";
import { hasPgErrorCode, PG_UNIQUE_VIOLATION } from "@/db/errors";
import { revokeUserSessions } from "./sessions";
import type { AtlasDatabase } from "./types";

/*
 * Sign-in with Google (Phase 3). Takes the database handle so the PGlite tests run this exact SQL; auth/index.ts binds
 * it to the production handle inside the Auth.js callbacks.
 *
 * The rules, in order:
 *  1. A Google account already linked (by its stable "sub" id, never by email) signs in to its Atlas account.
 *  2. Otherwise Google must say the email is verified; nothing is created or linked on an unverified email.
 *  3. A guest account with that email (made with a password) is joined to this Google account. Google has just proved
 *     the person owns the mailbox, while Atlas never verified who typed that email at sign-up, so the old password is
 *     removed and every existing session is ended: whoever created the account with someone else's email loses it
 *     (owner decision, 2026-11-13). The owner can set a password again through "Forgot password".
 *  4. No account with that email: a new guest account ("user", no password, no name) is created.
 *  Admin accounts are never signed in to, joined or created through Google.
 */

export type GoogleProfileClaims = { sub: unknown; email: unknown; emailVerified: unknown };

export type GoogleSignInRefusal = "invalid_profile" | "email_unverified" | "admin_account" | "other_google_account";
export type GoogleSignInResult =
  | { ok: true; userId: string; outcome: "signed_in" | "joined_existing_account" | "created_account" }
  | { ok: false; reason: GoogleSignInRefusal };

const subSchema = z.string().min(1).max(255);
const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

/** The Atlas account linked to this Google account, if any. */
export async function findGoogleLinkedAccount(
  db: AtlasDatabase,
  sub: string
): Promise<{ id: string; email: string; role: UserRole; passwordHash: string | null } | null> {
  const [row] = await db
    .select({ id: users.id, email: users.email, role: users.role, passwordHash: users.passwordHash })
    .from(userIdentities)
    .innerJoin(users, eq(users.id, userIdentities.userId))
    .where(and(eq(userIdentities.provider, "google"), eq(userIdentities.providerAccountId, sub)))
    .limit(1);
  return row ?? null;
}

export async function resolveGoogleSignIn(db: AtlasDatabase, claims: GoogleProfileClaims, now: Date): Promise<GoogleSignInResult> {
  try {
    return await resolveOnce(db, claims, now);
  } catch (error) {
    // Two first sign-ins at once (two tabs), or a password sign-up for the same email in the same instant: the unique
    // indexes decide and the loser rolled back. Once more, the winner's row is there and rule 1 or 3 applies.
    if (hasPgErrorCode(error, PG_UNIQUE_VIOLATION)) return resolveOnce(db, claims, now);
    throw error;
  }
}

async function resolveOnce(db: AtlasDatabase, claims: GoogleProfileClaims, now: Date): Promise<GoogleSignInResult> {
  const sub = subSchema.safeParse(claims.sub);
  if (!sub.success) return { ok: false, reason: "invalid_profile" };

  const linked = await findGoogleLinkedAccount(db, sub.data);
  if (linked) return linked.role === "admin" ? { ok: false, reason: "admin_account" } : { ok: true, userId: linked.id, outcome: "signed_in" };

  // Strictly true: a missing or string claim is not a verified email.
  if (claims.emailVerified !== true) return { ok: false, reason: "email_unverified" };
  const email = emailSchema.safeParse(claims.email);
  if (!email.success) return { ok: false, reason: "invalid_profile" };

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.email, email.data))
      .for("update")
      .limit(1);

    if (existing) {
      if (existing.role === "admin") return { ok: false, reason: "admin_account" } as const;
      const [current] = await tx
        .select({ providerAccountId: userIdentities.providerAccountId })
        .from(userIdentities)
        .where(and(eq(userIdentities.userId, existing.id), eq(userIdentities.provider, "google")))
        .limit(1);
      if (current) {
        // This same Google account, linked by a sign-in that finished in between (two tabs at once): just sign in.
        if (current.providerAccountId === sub.data) return { ok: true, userId: existing.id, outcome: "signed_in" } as const;
        // Already joined to a different Google account: never swap it silently.
        return { ok: false, reason: "other_google_account" } as const;
      }

      await tx.insert(userIdentities).values({ userId: existing.id, provider: "google", providerAccountId: sub.data, createdAt: now });
      await tx.update(users).set({ passwordHash: null, updatedAt: now }).where(eq(users.id, existing.id));
      await revokeUserSessions(tx, existing.id, now);
      return { ok: true, userId: existing.id, outcome: "joined_existing_account" } as const;
    }

    // Every new account starts as "user" (the column default): admin status is never granted here.
    const [created] = await tx.insert(users).values({ email: email.data, passwordHash: null, name: null }).returning({ id: users.id });
    await tx.insert(userIdentities).values({ userId: created.id, provider: "google", providerAccountId: sub.data, createdAt: now });
    return { ok: true, userId: created.id, outcome: "created_account" } as const;
  });
}
