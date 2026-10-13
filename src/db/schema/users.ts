import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { enumCheck } from "./sql-helpers";

export const USER_ROLES = ["user", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").notNull().default("user").$type<UserRole>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [check("users_role_check", enumCheck(table.role, USER_ROLES))]
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
