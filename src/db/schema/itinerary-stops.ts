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

/*
 * How a stop may be completed. "ar" joined in 0012: a camera match PLUS the same
 * GPS proximity every other method needs. "auto" is legacy and no writer produces it.
 */
export const CHECK_IN_METHODS = ["gps", "qr", "ar", "auto"] as const;
export type CheckInMethod = (typeof CHECK_IN_METHODS)[number];

// Why a PENDING stop was taken out of the active plan. Superseded rows are kept
// (never deleted) so the saved snapshot stays available as history.
//  - stop_unavailable:   replaced because its partnership/facility is no longer eligible
//  - plan_regenerated:   pending stop replaced by a full explicit rebuild
//  - removed_unavailable: explicitly removed by the guest because it became unavailable
export const STOP_SUPERSEDED_REASONS = ["stop_unavailable", "plan_regenerated", "removed_unavailable"] as const;
export type StopSupersededReason = (typeof STOP_SUPERSEDED_REASONS)[number];

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
    /**
     * How long this stop was expected to take, snapshotted like name and category so the saved
     * plan stays readable after the Place is edited. Null only on stops generated before the
     * Advisor budgeted time — never treated as zero (see services/advisor/visit-duration.ts).
     */
    visitDurationMinutes: integer("visit_duration_minutes"),
    position: integer("position").notNull(),
    visitedAt: timestamp("visited_at", { withTimezone: true }),
    // Set when a PENDING stop leaves the active plan. The row is never deleted. A visited
    // (completed) stop can never be superseded — enforced by a CHECK below.
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    supersededReason: text("superseded_reason").$type<StopSupersededReason>(),
  },
  (table) => [
    // History is sacred: a completed visit is never superseded, in any regeneration or rebuild path.
    check("itinerary_stops_completed_never_superseded_check", sql`${table.supersededAt} is null or ${table.visitedAt} is null`),
    check("itinerary_stops_superseded_pair_check", sql`(${table.supersededAt} is null) = (${table.supersededReason} is null)`),
    check(
      "itinerary_stops_superseded_reason_check",
      sql`${table.supersededReason} is null or ${enumCheck(table.supersededReason, STOP_SUPERSEDED_REASONS)}`
    ),
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
