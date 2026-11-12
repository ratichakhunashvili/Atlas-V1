import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { passwordResetTokens, users } from "@/db/schema";
import { revokeUserSessions } from "./sessions";
import type { AtlasDatabase } from "./types";

/*
 * Password-reset tokens. Only token hashes are ever passed in or stored. Takes the database handle
 * as an argument so the PGlite tests run this exact code.
 */

export async function findUserIdByEmail(db: AtlasDatabase, email: string): Promise<string | null> {
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(sql`lower(${users.email})`, email.trim().toLowerCase()))
    .limit(1);
  return row?.id ?? null;
}

/** Stores a new token and retires every older unused one for the user, in one transaction. */
export async function issueResetToken(
  db: AtlasDatabase,
  input: { userId: string; tokenHash: string; now: Date; expiresAt: Date }
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(passwordResetTokens)
      .set({ usedAt: input.now })
      .where(and(eq(passwordResetTokens.userId, input.userId), isNull(passwordResetTokens.usedAt)));
    await tx.insert(passwordResetTokens).values({
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      createdAt: input.now,
    });
  });
}

/** Whether the token exists, is unused and unexpired. Does not consume it. */
export async function isResetTokenUsable(db: AtlasDatabase, tokenHash: string, now: Date): Promise<boolean> {
  const [row] = await db
    .select({ id: passwordResetTokens.id })
    .from(passwordResetTokens)
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, now)
      )
    )
    .limit(1);
  return Boolean(row);
}

/**
 * Consumes the token and sets the new password hash atomically. The conditional UPDATE is the
 * single-use guard: two concurrent attempts cannot both succeed. In the same transaction it ends every session the
 * account had (sessions_valid_after = now), so whoever knew the old password is signed out everywhere. No other
 * account is touched.
 */
export async function consumeResetToken(
  db: AtlasDatabase,
  input: { tokenHash: string; passwordHash: string; now: Date }
): Promise<{ ok: boolean }> {
  return db.transaction(async (tx) => {
    const [used] = await tx
      .update(passwordResetTokens)
      .set({ usedAt: input.now })
      .where(
        and(
          eq(passwordResetTokens.tokenHash, input.tokenHash),
          isNull(passwordResetTokens.usedAt),
          gt(passwordResetTokens.expiresAt, input.now)
        )
      )
      .returning({ userId: passwordResetTokens.userId });
    if (!used) return { ok: false };
    await tx.update(users).set({ passwordHash: input.passwordHash, updatedAt: input.now }).where(eq(users.id, used.userId));
    await revokeUserSessions(tx, used.userId, input.now);
    return { ok: true };
  });
}
