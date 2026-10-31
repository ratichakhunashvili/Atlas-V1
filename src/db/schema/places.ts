import { sql } from "drizzle-orm";
import {
  check,
  integer,
  doublePrecision,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { enumCheck } from "./sql-helpers";

// Phase 1 note: "hotel" is included so a Place can be marked as a hotel
// anchor even though hotel CRUD also lives in its own `hotels` table
// (see db/schema/hotels.ts) for the stay/QR-token relationship.
export const PLACE_CATEGORIES = [
  "restaurant",
  "spa",
  "tour",
  "shop",
  "landmark",
  "historical",
  "nature",
  "museum",
  "beach",
  "nightlife",
  "attraction",
  "activity",
  "hotel",
  "other",
] as const;
export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

// A Place is only ever recommended to guests when it is BOTH published (an
// admin decided it is ready to show) AND verified (an admin confirmed it is a
// real, correctly described place) AND not archived. See
// services/eligibility/rules.ts — the one definition.
export const PUBLICATION_STATUSES = ["draft", "published"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const VERIFICATION_STATUSES = ["unverified", "verified"] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const places = pgTable(
  "places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    // latitude = north/south, longitude = east/west.
    // Mapbox expects [longitude, latitude] — never reorder these at rest.
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    category: text("category").notNull().$type<PlaceCategory>(),
    address: text("address"),
    imageUrl: text("image_url"),
    website: text("website"),
    phone: text("phone"),
    /**
     * LEGACY, no longer read or written. Place check-in credentials live in
     * `qr_credentials` (purpose "place_check_in"), hashed. Kept, not dropped,
     * so no existing row is destroyed; removable in a later migration.
     */
    qrToken: text("qr_token").unique(),
    // Soft-archive instead of hard delete: an archived Place is never
    // eligible for recommendations, but its partnership/itinerary history
    // stays intact (hotel_partnerships.place_id is ON DELETE RESTRICT).
    /**
     * How long a guest should expect to spend here, in minutes, set by an admin.
     * Null means "not configured": the Advisor then falls back to an explicit,
     * deterministic per-category estimate (services/advisor/visit-duration.ts) and
     * labels it as an estimate. Null never means zero — a stop that takes no time
     * would let the Advisor promise a day that cannot be walked.
     */
    visitDurationMinutes: integer("visit_duration_minutes"),
    /**
     * A simple relative price tier: 1 = budget, 2 = moderate, 3 = luxury (matches
     * user_preferences.budget). Set by an admin; null means UNKNOWN and is never
     * read as cheap, affordable or free. It only ranks Places for a guest with a
     * spending preference — it never makes a Place eligible or ineligible.
     */
    priceLevel: integer("price_level"),
    /**
     * Where the price tier came from, and when an admin last confirmed it. A price level only exists WITH its evidence
     * (the CHECK below), so an unsourced guess can never reach a guest's ranking or screen.
     */
    priceLevelSource: text("price_level_source"),
    priceLevelVerifiedAt: timestamp("price_level_verified_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    // New and migrated Places start as draft / unverified so nothing becomes
    // recommendable by accident; an admin publishes and verifies explicitly.
    publicationStatus: text("publication_status").notNull().default("draft").$type<PublicationStatus>(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    verificationStatus: text("verification_status").notNull().default("unverified").$type<VerificationStatus>(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("places_category_idx").on(table.category),
    // A plain btree placeholder, not a geo index — fine for Phase 1's list
    // views, but radius/bounding-box queries in the Map phase will need
    // PostGIS or a proper geo index instead.
    index("places_coordinates_idx").on(table.latitude, table.longitude),
    // A visit takes a positive amount of time, and a stop lasting more than a day is
    // a data-entry mistake rather than an experience.
    check("places_visit_duration_check", sql`${table.visitDurationMinutes} is null or (${table.visitDurationMinutes} > 0 and ${table.visitDurationMinutes} <= 1440)`),
    check("places_price_level_check", sql`${table.priceLevel} is null or ${table.priceLevel} between 1 and 3`),
    check(
      "places_price_level_evidence_check",
      sql`${table.priceLevel} is null or (${table.priceLevelSource} is not null and ${table.priceLevelVerifiedAt} is not null)`
    ),
    check("places_category_check", enumCheck(table.category, PLACE_CATEGORIES)),
    check("places_publication_status_check", enumCheck(table.publicationStatus, PUBLICATION_STATUSES)),
    check("places_verification_status_check", enumCheck(table.verificationStatus, VERIFICATION_STATUSES)),
    // Status and its timestamp must agree, so a status can never be set without leaving an audit trail.
    check("places_published_requires_date_check", sql`${table.publicationStatus} <> 'published' or ${table.publishedAt} is not null`),
    check("places_verified_requires_date_check", sql`${table.verificationStatus} <> 'verified' or ${table.verifiedAt} is not null`),
    // Archiving a Place always unpublishes it.
    check("places_archived_not_published_check", sql`${table.archivedAt} is null or ${table.publicationStatus} <> 'published'`),
  ]
);

export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
