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
  ]
);

export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
