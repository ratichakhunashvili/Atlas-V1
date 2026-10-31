import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, timestamp, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { hotels } from "./hotels";
import { places } from "./places";
import { enumCheck } from "./sql-helpers";
import { users } from "./users";

export const PARTNERSHIP_STATUSES = ["pending_review", "active", "suspended", "revoked"] as const;
export type PartnershipStatus = (typeof PARTNERSHIP_STATUSES)[number];

// An EXTERNAL business/experience explicitly partnered with ONE hotel. A
// Place is only ever recommended to a hotel's guests through an `active` row
// here (inside its optional date window) — see services/eligibility. Hotel-
// OWNED facilities live in hotel_facilities instead; the two are
// deliberately separate concepts.
//
// "Expired" is not a stored status: it is derived from `ends_at`, so a
// partnership can never be left `active` and silently stay eligible.
export const hotelPartnerships = pgTable(
  "hotel_partnerships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    // RESTRICT: a Place with partnership history cannot be hard-deleted.
    // Archive it instead (places.archived_at).
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("pending_review").$type<PartnershipStatus>(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    // Nullable: null falls back to the Advisor's default freshness/distance ranking.
    priority: integer("priority"),
    /**
     * Featured by THIS hotel: a featured partner that fits the guest's choices always takes one of the three
     * options and is shown larger, labelled "Featured". Ranking only — it can never make a Place eligible,
     * and a partnership with Hotel A being featured says nothing about Hotel B.
     */
    featured: boolean("featured").notNull().default(false),
    /** A short offer this hotel's guests get (e.g. "10% off for hotel guests"). Shown as written; Atlas takes no payment. */
    offerText: text("offer_text"),
    // Set when an admin explicitly confirms; SET NULL so deleting the admin
    // account never deletes (or invalidates) the partnership record.
    confirmedBy: uuid("confirmed_by").references(() => users.id, { onDelete: "set null" }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One relationship row per (hotel, Place); each hotel needs its OWN row —
    // a partnership with Hotel A never applies to Hotel B.
    uniqueIndex("hotel_partnerships_hotel_place_idx").on(table.hotelId, table.placeId),
    index("hotel_partnerships_hotel_status_idx").on(table.hotelId, table.status),
    index("hotel_partnerships_place_idx").on(table.placeId),
    check("hotel_partnerships_status_check", enumCheck(table.status, PARTNERSHIP_STATUSES)),
    // An admin must have explicitly confirmed (timestamped) any active row.
    check(
      "hotel_partnerships_active_requires_confirmation_check",
      sql`${table.status} <> 'active' or ${table.confirmedAt} is not null`
    ),
    check("hotel_partnerships_offer_text_check", sql`${table.offerText} is null or char_length(${table.offerText}) between 1 and 120`),
    check(
      "hotel_partnerships_window_check",
      sql`${table.startsAt} is null or ${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`
    ),
  ]
);

export type HotelPartnership = typeof hotelPartnerships.$inferSelect;
export type NewHotelPartnership = typeof hotelPartnerships.$inferInsert;
