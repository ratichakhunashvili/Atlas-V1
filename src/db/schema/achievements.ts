import { guestPrincipals } from "./guest-principals";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { CHECK_IN_METHODS, type CheckInMethod } from "./itinerary-stops";
import { placeVisits } from "./place-visits";
import { places } from "./places";
import { users } from "./users";
import { enumCheck } from "./sql-helpers";

/**
 * An optional badge attached to a Place.
 *
 * **At most one per Place**, enforced by a unique constraint rather than a
 * convention — the approved rule, and the thing that keeps "unlocked" a single
 * yes/no fact per Place instead of a collection to reconcile.
 *
 * An achievement is a collectible, not a currency. There is no points column, no
 * level, no streak and no leaderboard, and none should be added: the product rule
 * is that achievements are unlocks, not an economy.
 *
 * The Place reference is RESTRICT: a Place somebody has earned a badge at is
 * archived, never deleted.
 */
export const achievements = pgTable(
  "achievements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    /** Badge artwork. A URL from the project's storage service; never a data blob in the row. */
    badgeImageUrl: text("badge_image_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("achievements_place_unique").on(table.placeId),
    check("achievements_name_not_blank_check", sql`length(trim(${table.name})) > 0`),
  ]
);

export type Achievement = typeof achievements.$inferSelect;
export type NewAchievement = typeof achievements.$inferInsert;

/**
 * One guest earning one badge, once.
 *
 * Unique on (user, achievement): an unlock is permanent and cannot be earned
 * twice, so a repeat visit updates the visit count and leaves this alone — which
 * is also what stops the first-unlock celebration firing again.
 *
 * `placeVisitId` records WHICH verified visit justified it, so the unlock can
 * always be traced back to the evidence. It is RESTRICT: the visit that earned a
 * badge cannot be deleted out from under it.
 */
export const achievementUnlocks = pgTable(
  "achievement_unlocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Stage A (docs/guest-principal-plan.md): the owning principal. Nullable and unread until Stage B; user_id stays the source of truth. */
    principalId: uuid("principal_id").references(() => guestPrincipals.id),
    achievementId: uuid("achievement_id")
      .notNull()
      .references(() => achievements.id, { onDelete: "restrict" }),
    /** The verified visit that earned it. The audit trail from badge back to evidence. */
    placeVisitId: uuid("place_visit_id")
      .notNull()
      .references(() => placeVisits.id, { onDelete: "restrict" }),
    /** How that visit was proved, denormalised so the trail survives even if methods change later. */
    verificationMethod: text("verification_method").notNull().$type<CheckInMethod>(),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    unique("achievement_unlocks_user_achievement_unique").on(table.userId, table.achievementId),
    check("achievement_unlocks_method_check", enumCheck(table.verificationMethod, CHECK_IN_METHODS)),
    index("achievement_unlocks_user_idx").on(table.userId),
  ]
);

export type AchievementUnlock = typeof achievementUnlocks.$inferSelect;
export type NewAchievementUnlock = typeof achievementUnlocks.$inferInsert;
