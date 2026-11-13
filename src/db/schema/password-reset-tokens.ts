import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * One row per password-reset link that was emailed. Only the SHA-256 of the token is stored, so a
 * database leak cannot be turned into working reset links. A row is single use (`usedAt`) and
 * short lived (`expiresAt`); deleting the user deletes their tokens.
 */
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Hex SHA-256 of the opaque token in the emailed link. */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("password_reset_tokens_token_hash_unique").on(table.tokenHash),
    index("password_reset_tokens_user_idx").on(table.userId),
    // At most one unused link per account, enforced by the database even if two requests race.
    uniqueIndex("password_reset_tokens_one_unused_per_user").on(table.userId).where(sql`${table.usedAt} is null`),
  ]
);

export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
