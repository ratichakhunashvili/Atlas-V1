import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { enumCheck } from "./sql-helpers";

/**
 * Throttles for the two screens a visitor uses BEFORE they are signed in: sign-in and sign-up.
 *
 * `rate_limit_attempts` is keyed to a signed-in user, so it cannot count these. Here the key is a
 * SHA-256 hash of what identifies the attempt ("email:<address>" or "ip:<address>"), so the table
 * never holds a readable email or IP address.
 */
export const AUTH_RATE_LIMIT_SCOPES = [
  /** A failed sign-in for one email address. */
  "sign_in_email",
  /** A failed sign-in from one network. Loose, because a whole hotel shares one wifi. */
  "sign_in_ip",
  /** Any sign-up attempt from one network. */
  "sign_up_ip",
] as const;
export type AuthRateLimitScope = (typeof AUTH_RATE_LIMIT_SCOPES)[number];

export const authRateLimitAttempts = pgTable(
  "auth_rate_limit_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scope: text("scope").notNull().$type<AuthRateLimitScope>(),
    /** Hex SHA-256 of the identifying value, never the value itself. */
    keyHash: text("key_hash").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("auth_rate_limit_attempts_scope_check", enumCheck(table.scope, AUTH_RATE_LIMIT_SCOPES)),
    index("auth_rate_limit_attempts_key_scope_time_idx").on(table.keyHash, table.scope, table.occurredAt),
  ]
);

export type AuthRateLimitAttempt = typeof authRateLimitAttempts.$inferSelect;
