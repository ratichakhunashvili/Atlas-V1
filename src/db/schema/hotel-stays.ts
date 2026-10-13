import { sql } from "drizzle-orm";
import { index, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { hotels } from "./hotels";
import { users } from "./users";

export const hotelStays = pgTable(
  "hotel_stays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    checkIn: timestamp("check_in", { withTimezone: true }).notNull(),
    checkOut: timestamp("check_out", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("hotel_stays_user_idx").on(table.userId),
    index("hotel_stays_hotel_idx").on(table.hotelId),
    // "A user should not have multiple simultaneously active stays" enforced
    // at the DB level, not just in the check-in action: at most one row per
    // user with no checkout yet. Historical (checked-out) stays are
    // unaffected since NULL checkOut values are the only ones compared.
    uniqueIndex("hotel_stays_active_user_idx")
      .on(table.userId)
      .where(sql`${table.checkOut} is null`),
  ]
);

export type HotelStay = typeof hotelStays.$inferSelect;
export type NewHotelStay = typeof hotelStays.$inferInsert;
