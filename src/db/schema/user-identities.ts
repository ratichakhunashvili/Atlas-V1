import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { enumCheck } from "./sql-helpers";
import { users } from "./users";

/*
 * Sign-in with an outside account (Phase 3: Google only). One row links one Google account (its stable "sub" id) to one
 * Atlas account. Only the id is stored: no Google profile, photo or token. Deleting the Atlas account deletes the link.
 * Admin access is never granted through a linked account (lib/authorization.ts requireAdmin).
 */
export const IDENTITY_PROVIDERS = ["google"] as const;
export type IdentityProvider = (typeof IDENTITY_PROVIDERS)[number];

export const userIdentities = pgTable(
  "user_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().$type<IdentityProvider>(),
    /** The provider's own, stable id for the account (Google's "sub"). Never an email, which can change hands. */
    providerAccountId: text("provider_account_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("user_identities_provider_check", enumCheck(table.provider, IDENTITY_PROVIDERS)),
    check("user_identities_provider_account_id_check", sql`char_length(${table.providerAccountId}) between 1 and 255`),
    // One Atlas account per Google account, and one Google account per Atlas account (this one also serves lookups by user).
    uniqueIndex("user_identities_provider_account_unique").on(table.provider, table.providerAccountId),
    uniqueIndex("user_identities_user_provider_unique").on(table.userId, table.provider),
  ]
);

export type UserIdentity = typeof userIdentities.$inferSelect;
