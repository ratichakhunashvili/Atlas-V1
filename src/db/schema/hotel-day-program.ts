import { sql } from "drizzle-orm";
import { check, integer, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { hotels } from "./hotels";

/** A hotel's "Day program" (owner decision 2026-11-15): at most 4 ordered steps, each offering 1-3 places. */
export const MAX_DAY_PROGRAM_STEPS = 4;
export const MAX_DAY_PROGRAM_STEP_PLACES = 3;

/**
 * One step of a hotel's day program: the guest's k-th task offers these places (pick one; a 1-place step is
 * mandatory). The program only ORDERS what a guest is offered: the daily plan filters every id through the guest's
 * eligible catalogue, so a place listed here never becomes visible because it is listed (docs/catalogue-model-plan.md).
 *
 * Place ids are an array, not a child table: an archived or deleted place is simply skipped when offered, so no FK is
 * needed, and the whole program is replaced at once by the audited admin save. "1-3 places" and "positions 1-4,
 * once each" are database CHECKs/indexes; "no place twice in one program" spans rows, so the save validates it
 * (features/hotels/day-program.ts) inside the same transaction that writes the program.
 */
export const hotelDayProgramSteps = pgTable(
  "hotel_day_program_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    placeIds: uuid("place_ids").array().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("hotel_day_program_steps_hotel_position_idx").on(table.hotelId, table.position),
    check("hotel_day_program_steps_position_check", sql`${table.position} between 1 and 4`),
    check("hotel_day_program_steps_places_check", sql`cardinality(${table.placeIds}) between 1 and 3`),
  ]
);

export type HotelDayProgramStep = typeof hotelDayProgramSteps.$inferSelect;
