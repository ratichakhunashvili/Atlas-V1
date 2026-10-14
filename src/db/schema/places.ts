import { sql } from "drizzle-orm";
import {
  check,
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
    // Nullable + unique: most Places never need one. Reserved for future
    // Place-level QR flows (partner check-in, AR/achievement unlocking) —
    // not used by hotel check-in, which reuses hotels.qrToken (unaffected).
    qrToken: text("qr_token").unique(),
    // Soft-archive instead of hard delete: an archived Place is never
    // eligible for recommendations, but its partnership/itinerary history
    // stays intact (hotel_partnerships.place_id is ON DELETE RESTRICT).
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
