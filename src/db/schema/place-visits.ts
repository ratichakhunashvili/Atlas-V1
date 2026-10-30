import { guestPrincipals } from "./guest-principals";
import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { CHECK_IN_METHODS, type CheckInMethod } from "./itinerary-stops";
import { places } from "./places";
import { users } from "./users";
import { enumCheck } from "./sql-helpers";

/**
 * "This person has really been here." One row per user per Place, for ever.
 *
 * Deliberately SEPARATE from itinerary-stop completion, which records something
 * narrower: "this stop, in this plan, on this day, was completed". The two answer
 * different questions and must not be collapsed:
 *
 *  - a guest may visit the same Place on three different stays — three completed
 *    stops, but one place they have been to;
 *  - a plan can be repaired and its pending stops superseded, and none of that may
 *    touch where the guest has actually stood;
 *  - a Place can be archived, or its partnership revoked, long after the visit —
 *    the visit still happened.
 *
 * `place_id` is RESTRICT, not cascade: a Place with visits is archived, never
 * deleted, because deleting it would rewrite people's history.
 */
export const placeVisits = pgTable(
  "place_visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Stage A (docs/guest-principal-plan.md): the owning principal. Nullable and unread until Stage B; user_id stays the source of truth. */
    principalId: uuid("principal_id").references(() => guestPrincipals.id),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "restrict" }),
    /** The first verified arrival. Never moves: it is when they first got here. */
    firstVisitedAt: timestamp("first_visited_at", { withTimezone: true }).notNull(),
    /** The most recent verified arrival. Moves on every repeat visit. */
    lastVisitedAt: timestamp("last_visited_at", { withTimezone: true }).notNull(),
    /** Verified arrivals so far. Starts at 1 — the row exists because of one. */
    visitCount: integer("visit_count").notNull().default(1),
    /** How the FIRST visit was proved, kept as the audit trail for the unlock it justified. */
    firstVerificationMethod: text("first_verification_method").notNull().$type<CheckInMethod>(),
  },
  (table) => [
    /*
     * One row per user per Place. This is what makes recording idempotent: a repeat
     * check-in updates the row instead of creating a second history of the same
     * fact, and two simultaneous requests cannot both insert.
     */
    unique("place_visits_user_place_unique").on(table.userId, table.placeId),
    check("place_visits_count_positive_check", sql`${table.visitCount} >= 1`),
    check("place_visits_order_check", sql`${table.lastVisitedAt} >= ${table.firstVisitedAt}`),
    check("place_visits_method_check", enumCheck(table.firstVerificationMethod, CHECK_IN_METHODS)),
    index("place_visits_user_idx").on(table.userId),
  ]
);

export type PlaceVisit = typeof placeVisits.$inferSelect;
export type NewPlaceVisit = typeof placeVisits.$inferInsert;
