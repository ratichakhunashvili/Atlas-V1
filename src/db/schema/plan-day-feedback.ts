import { sql } from "drizzle-orm";
import { check, index, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { hotels } from "./hotels";
import { itineraryDays } from "./itinerary-days";
import { users } from "./users";

/*
 * Private feedback on one finished plan day (Phase 2, owner decision 2026-11-13). Only Atlas platform admins read it;
 * guests never see anyone's feedback, their own included, apart from their data export. It is not a public review.
 *
 * One row per plan day (unique itinerary_day_id). Every segment has a 1–5 rating and an optional note. Overall is
 * required; every other rating may be NULL, meaning "didn't use it". Explicit columns rather than JSON, so the
 * database itself holds the 1–5 range, the required overall rating and the note length.
 *
 * Deleting the user or the day deletes the feedback. hotel_id is copied from the day on the server (never from the
 * form) so admins can filter by hotel; like the day it belongs to, it RESTRICTs hotel deletion.
 */

/** A rating column: 1–5, or NULL for "didn't use it" (a NULL makes the CHECK unknown, which passes). */
const rating = (name: string) => smallint(name);
/** An optional note: at most 1000 characters. */
const note = (name: string) => text(name);

export const planDayFeedback = pgTable(
  "plan_day_feedback",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    itineraryDayId: uuid("itinerary_day_id")
      .notNull()
      .references(() => itineraryDays.id, { onDelete: "cascade" }),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    overallRating: rating("overall_rating").notNull(),
    overallNote: note("overall_note"),
    technicalRating: rating("technical_rating"),
    technicalNote: note("technical_note"),
    mapRating: rating("map_rating"),
    mapNote: note("map_note"),
    placesRating: rating("places_rating"),
    placesNote: note("places_note"),
    checkinRating: rating("checkin_rating"),
    checkinNote: note("checkin_note"),
    moneyRating: rating("money_rating"),
    moneyNote: note("money_note"),
    hotelRating: rating("hotel_rating"),
    hotelNote: note("hotel_note"),
  },
  (table) => [
    uniqueIndex("plan_day_feedback_day_unique").on(table.itineraryDayId),
    index("plan_day_feedback_hotel_created_idx").on(table.hotelId, table.createdAt),
    index("plan_day_feedback_user_idx").on(table.userId),
    check("plan_day_feedback_overall_rating_check", sql`${table.overallRating} between 1 and 5`),
    check("plan_day_feedback_technical_rating_check", sql`${table.technicalRating} between 1 and 5`),
    check("plan_day_feedback_map_rating_check", sql`${table.mapRating} between 1 and 5`),
    check("plan_day_feedback_places_rating_check", sql`${table.placesRating} between 1 and 5`),
    check("plan_day_feedback_checkin_rating_check", sql`${table.checkinRating} between 1 and 5`),
    check("plan_day_feedback_money_rating_check", sql`${table.moneyRating} between 1 and 5`),
    check("plan_day_feedback_hotel_rating_check", sql`${table.hotelRating} between 1 and 5`),
    check("plan_day_feedback_overall_note_check", sql`char_length(${table.overallNote}) <= 1000`),
    check("plan_day_feedback_technical_note_check", sql`char_length(${table.technicalNote}) <= 1000`),
    check("plan_day_feedback_map_note_check", sql`char_length(${table.mapNote}) <= 1000`),
    check("plan_day_feedback_places_note_check", sql`char_length(${table.placesNote}) <= 1000`),
    check("plan_day_feedback_checkin_note_check", sql`char_length(${table.checkinNote}) <= 1000`),
    check("plan_day_feedback_money_note_check", sql`char_length(${table.moneyNote}) <= 1000`),
    check("plan_day_feedback_hotel_note_check", sql`char_length(${table.hotelNote}) <= 1000`),
  ]
);

export type PlanDayFeedback = typeof planDayFeedback.$inferSelect;
export type NewPlanDayFeedback = typeof planDayFeedback.$inferInsert;
