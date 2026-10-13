import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { itineraryDays } from "./itinerary-days";
import { PLACE_CATEGORIES, places, type PlaceCategory } from "./places";
import { enumCheck } from "./sql-helpers";

export const CHECK_IN_METHODS = ["gps", "qr", "auto"] as const;
export type CheckInMethod = (typeof CHECK_IN_METHODS)[number];

// Schema-only for now (Phase 3 Step 2) — no itinerary engine reads or writes
// this yet. One ordered stop within a generated day. Snapshots name/category/
// location/image so the plan stays historically readable even if the source
// Place is later edited or deleted — never the full Place row.
export const itineraryStops = pgTable(
  "itinerary_stops",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    dayId: uuid("day_id")
      .notNull()
      .references(() => itineraryDays.id, { onDelete: "cascade" }),
    // Nullable: a Place deletion clears this without breaking the row — the
    // snapshot fields below remain the historical source of truth regardless.
    placeId: uuid("place_id").references(() => places.id, { onDelete: "set null" }),
    // Replaces the old "hotel" stop type: an itinerary-stop property (always
    // visited, forced first), not a different kind of Place.
    isHotelStop: boolean("is_hotel_stop").notNull().default(false),
    // Decided once at generation time from the Place's category / hotel_places
    // relationship — never re-derived from scattered category checks at
    // check-in time (see the Phase 3 compatibility analysis, §6).
    checkInMethod: text("check_in_method").notNull().$type<CheckInMethod>(),
    name: text("name").notNull(),
    category: text("category").$type<PlaceCategory>(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    imageUrl: text("image_url"),
    position: integer("position").notNull(),
    visitedAt: timestamp("visited_at", { withTimezone: true }),
  },
  (table) => [
    // The ordered stop list is read on every itinerary page view.
    index("itinerary_stops_day_position_idx").on(table.dayId, table.position),
    check("itinerary_stops_check_in_method_check", enumCheck(table.checkInMethod, CHECK_IN_METHODS)),
    check(
      "itinerary_stops_category_check",
      sql`${table.category} is null or ${enumCheck(table.category, PLACE_CATEGORIES)}`
    ),
  ]
);

export type ItineraryStop = typeof itineraryStops.$inferSelect;
export type NewItineraryStop = typeof itineraryStops.$inferInsert;
