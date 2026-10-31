import { guestPrincipals } from "./guest-principals";
import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { enumCheck } from "./sql-helpers";
import { hotels } from "./hotels";
import { users } from "./users";

/**
 * Where a stay's dates came from. A hotel-entry QR proves only WHICH hotel the guest chose — not a reservation and
 * not occupancy — so dates are "guest_declared" unless a supported reservation ticket or hotel integration vouches
 * for them. Nothing sets "verified" today; the value exists so the UI and the data never overclaim and a future
 * integration has an honest place to land.
 */
export const STAY_DATES_SOURCES = ["guest_declared", "verified"] as const;
export type StayDatesSource = (typeof STAY_DATES_SOURCES)[number];

export const hotelStays = pgTable(
  "hotel_stays",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Stage A (docs/guest-principal-plan.md): the owning principal. Nullable and unread until Stage B; user_id stays the source of truth. */
    principalId: uuid("principal_id").references(() => guestPrincipals.id),
    /*
     * RESTRICT, not cascade (migration 0009): a guest's stay is the GUEST's
     * history, not the hotel's. Deleting a hotel used to erase every stay at it —
     * and every itinerary and completed visit inside those stays — with nothing
     * saying so. The database now refuses, so an app-level guard is a courtesy
     * rather than the only thing standing between an admin click and somebody's
     * record of their trip.
     */
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "restrict" }),
    checkIn: timestamp("check_in", { withTimezone: true }).notNull(),
    checkOut: timestamp("check_out", { withTimezone: true }),
    /**
     * The departure date the guest declared (or a verified source supplied). Distinct from check_out, whose NULL
     * means "this stay is still active" — setting a planned departure must not end the stay. The last day of the
     * stay is this date, inclusive.
     */
    expectedCheckOut: timestamp("expected_check_out", { withTimezone: true }),
    datesSource: text("dates_source").notNull().default("guest_declared").$type<StayDatesSource>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("hotel_stays_dates_source_check", enumCheck(table.datesSource, STAY_DATES_SOURCES)),
    check(
      "hotel_stays_expected_check_out_check",
      sql`${table.expectedCheckOut} is null or ${table.expectedCheckOut} > ${table.checkIn}`
    ),
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
