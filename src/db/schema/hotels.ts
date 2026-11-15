import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { places } from "./places";

/** "Tasks per day" an admin may set for a hotel (0040). The CHECK below holds the same 1-4 range. */
export const MIN_DAILY_TASK_LIMIT = 1;
export const MAX_DAILY_TASK_LIMIT = 4;

// Deliberately no `name`/`description` here: a Hotel is a Place (see
// db/schema/places.ts) plus hotel-specific concerns (the QR token). Reading
// the hotel's name/description through its Place keeps Place the single
// source of truth per the "Place is canonical" architecture rule, instead of
// letting hotel-specific copy drift out of sync with the shared Place.
export const hotels = pgTable("hotels", {
  id: uuid("id").primaryKey().defaultRandom(),
  placeId: uuid("place_id")
    .notNull()
    .unique()
    .references(() => places.id, { onDelete: "restrict" }),
  /**
   * LEGACY, no longer read or written. Hotel-entry credentials live in
   * `qr_credentials` (purpose "hotel_entry"), where only a hash is stored.
   * Relaxed to nullable in 0005 so new hotels need no raw token; the column
   * itself is kept rather than dropped so no existing row is destroyed. A
   * later migration can remove it once nothing in the record needs it.
   */
  qrToken: text("qr_token").unique(),
  /**
   * How many activities a guest's day may have at this hotel (1-4, default 4), set by an admin. Read live by the
   * daily plan (services/advisor/daily-plan.ts): a change applies from the next decision on, today's day included.
   */
  dailyTaskLimit: integer("daily_task_limit").notNull().default(MAX_DAILY_TASK_LIMIT),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (table) => [
  check("hotels_daily_task_limit_check", sql`${table.dailyTaskLimit} between 1 and 4`),
]);

export type Hotel = typeof hotels.$inferSelect;
export type NewHotel = typeof hotels.$inferInsert;
