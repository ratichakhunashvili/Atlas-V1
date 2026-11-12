import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { enumCheck } from "./sql-helpers";

export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    /** What the guest asked to be called; optional, never used to identify them. */
    name: text("name"),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("user").$type<UserRole>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /**
     * Sessions signed in before this moment are over (sign-out, password reset). Null: none has been ended. An Auth.js
     * JWT is otherwise valid until it expires, so every authenticated request compares its sign-in time with this
     * (sessionStanding in lib/session-standing.ts).
     */
    sessionsValidAfter: timestamp("sessions_valid_after", { withTimezone: true }),
  },
  (table) => [
    check("users_role_check", enumCheck(table.role, USER_ROLES)),
    // One account per address whatever its letter case; the app stores emails trimmed and lower-case.
    uniqueIndex("users_email_lower_unique").on(sql`lower(${table.email})`),
    check("users_email_lowercase_check", sql`${table.email} = lower(trim(${table.email}))`),
  ]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
