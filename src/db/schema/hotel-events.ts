import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { hotels } from "./hotels";
import { places } from "./places";
import { enumCheck } from "./sql-helpers";

export const HOTEL_EVENT_STATUSES = ["scheduled", "cancelled"] as const;
export type HotelEventStatus = (typeof HOTEL_EVENT_STATUSES)[number];

/**
 * A real, time-bounded thing happening at a hotel: a tasting at 19:00, a guided
 * walk on Saturday morning.
 *
 * It is NOT a Place and does not copy one. It references the hotel it belongs to
 * and the canonical venue Place it happens at, so location, name and coordinates
 * still have exactly one source. The `"event"` hotel-facility type remains what it
 * was — a permanent event SPACE — because a facility has no schedule to express.
 *
 * An event belongs to one hotel, so only that hotel's guests can ever be offered
 * it; the venue must additionally be eligible for that hotel, exactly like any
 * other stop.
 *
 * Deliberately absent: capacity, booking, seats, attendance. Atlas shows that
 * something is happening and when. It does not reserve anything, and nothing in
 * the product may imply that it does, until booking is designed and approved.
 */
export const hotelEvents = pgTable(
  "hotel_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    // RESTRICT, like every other relationship that carries history: a venue with
    // events is archived, never deleted out from under them.
    venuePlaceId: uuid("venue_place_id")
      .notNull()
      .references(() => places.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("scheduled").$type<HotelEventStatus>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("hotel_events_status_check", enumCheck(table.status, HOTEL_EVENT_STATUSES)),
    // An event that ends before it starts has no duration the Advisor could budget.
    check("hotel_events_ends_after_starts_check", sql`${table.endsAt} > ${table.startsAt}`),
    // The read is always "this hotel's events, soonest first".
    index("hotel_events_hotel_starts_idx").on(table.hotelId, table.startsAt),
  ]
);

export type HotelEvent = typeof hotelEvents.$inferSelect;
export type NewHotelEvent = typeof hotelEvents.$inferInsert;
