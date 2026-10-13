import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { enumCheck } from "./sql-helpers";
import { users } from "./users";

export const BUDGET_LEVELS = ["budget", "moderate", "luxury"] as const;
export type BudgetLevel = (typeof BUDGET_LEVELS)[number];

export const ACTIVITY_LEVELS = ["low", "moderate", "high"] as const;
export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

export const userPreferences = pgTable(
  "user_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    // Validated against PLACE_CATEGORIES at the zod boundary (features/users/schema.ts)
    // rather than a DB array CHECK, which would need to be kept in sync by hand.
    categories: text("categories")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    budget: text("budget").$type<BudgetLevel>(),
    activityLevel: text("activity_level").$type<ActivityLevel>(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "user_preferences_budget_check",
      sql`${table.budget} is null or ${enumCheck(table.budget, BUDGET_LEVELS)}`
    ),
    check(
      "user_preferences_activity_level_check",
      sql`${table.activityLevel} is null or ${enumCheck(table.activityLevel, ACTIVITY_LEVELS)}`
    ),
  ]
);

export type UserPreferences = typeof userPreferences.$inferSelect;
export type NewUserPreferences = typeof userPreferences.$inferInsert;
