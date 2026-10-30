import { index, pgTable, timestamp, text, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * Who owns a guest's data: an anonymous guest session, or an Auth.js account that has been linked to it.
 * (docs/guest-principal-plan.md — Stage A, additive only.)
 *
 * A principal is ANONYMOUS while `user_id` is NULL and LINKED once an account is attached. Every existing user gets
 * exactly one principal from the backfill, so nothing a current guest has is orphaned. Staff authentication stays on
 * `users` and is untouched: admin permissions never come from a principal.
 *
 * STAGE A ONLY ADDS STRUCTURE. The guest-owned tables gain a nullable `principal_id` and keep `user_id` as the source
 * of truth; nothing reads the new column yet, so Stage A changes no behaviour and can sit in production indefinitely.
 */
export const guestPrincipals = pgTable("guest_principals", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** The linked account, or null while anonymous. At most one principal per account. */
  userId: uuid("user_id")
    .unique()
    .references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  /** When an account was attached; null while anonymous. */
  linkedAt: timestamp("linked_at", { withTimezone: true }),
});

/**
 * One browser's hold on a principal. The cookie value is opaque and never stored — only its SHA-256 hash is, so a
 * database read cannot be replayed as a login. Two expiries: idle (since last use) and absolute (since creation);
 * rotation keeps a chain through `rotated_from`, and a revoked or expired session resolves to nobody.
 */
export const guestSessions = pgTable(
  "guest_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    principalId: uuid("principal_id")
      .notNull()
      .references(() => guestPrincipals.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
    absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
    rotatedFrom: uuid("rotated_from").references((): AnyPgColumn => guestSessions.id, { onDelete: "set null" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("guest_sessions_principal_idx").on(table.principalId)]
);

export type GuestPrincipal = typeof guestPrincipals.$inferSelect;
export type GuestSession = typeof guestSessions.$inferSelect;
