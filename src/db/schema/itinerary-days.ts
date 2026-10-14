import { integer, jsonb, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { hotels } from "./hotels";
import { hotelStays } from "./hotel-stays";
import { users } from "./users";

// Schema-only for now (Phase 3 Step 2) — no itinerary engine reads or writes
// this yet. One generated day-plan (a walking loop from the hotel through a
// handful of stops) for a guest at a hotel.
export const itineraryDays = pgTable(
  "itinerary_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    // Traceability only (which stay this plan was generated during) — not
    // load-bearing for itinerary logic, which keys off userId+hotelId.
    hotelStayId: uuid("hotel_stay_id").references(() => hotelStays.id, { onDelete: "set null" }),
    dayNumber: integer("day_number").notNull(),
    stopCount: integer("stop_count").notNull(),
    /** Cached Mapbox Optimization API result (GeoJSON LineString) for the round trip. */
    routeGeoJson: jsonb("route_geo_json"),
    /** Walking time of the ACTIVE route (what the guest sees). Updated when a plan is repaired, so it always matches the stops still on the route. */
    totalDurationSeconds: integer("total_duration_seconds"),
    /**
     * The estimate when the plan was GENERATED. Never changed by a repair, so the adaptive-difficulty ratchet
     * keeps comparing the guest's real completion time with the original estimate. Null on days created before
     * this column existed (the difficulty system then falls back to totalDurationSeconds).
     */
    originalDurationSeconds: integer("original_duration_seconds"),
    generatedAt: timestamp("generated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [unique().on(table.userId, table.hotelId, table.dayNumber)]
);

export type ItineraryDay = typeof itineraryDays.$inferSelect;
export type NewItineraryDay = typeof itineraryDays.$inferInsert;
