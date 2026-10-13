import { index, integer, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { hotels } from "./hotels";
import { places } from "./places";

// "This Place is a partner / priority location for this hotel" — a
// relationship on the canonical `places` row, never a second Place entity.
// A Place becomes a hotel's partner by gaining a row here; it never stops
// being the same `places` row the map, Advisor, and Achievements all read.
export const hotelPlaces = pgTable(
  "hotel_places",
  {
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    // Nullable: null falls back to the Advisor's default freshness/distance
    // ranking; a hotel only needs to set this to prioritize a partner.
    priority: integer("priority"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.hotelId, table.placeId] }),
    index("hotel_places_place_idx").on(table.placeId),
  ]
);

export type HotelPlace = typeof hotelPlaces.$inferSelect;
export type NewHotelPlace = typeof hotelPlaces.$inferInsert;
