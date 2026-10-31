import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { places } from "./places";

// Deliberately no `name`/`description` here: a Hotel is a Place (see
// db/schema/places.ts) plus hotel-specific concerns (the QR token). Reading
// the hotel's name/description through its Place keeps Place the single
// source of truth per the "Place is canonical" architecture rule, instead of
// letting hotel-specific copy drift out of sync with the shared Place.
export const hotels = pgTable("hotels", {
  id: uuid("id").primaryKey().defaultRandom(),
  placeId: uuid("place_id")
    .notNull()
    .unique()
    .references(() => places.id, { onDelete: "restrict" }),
  /**
   * LEGACY, no longer read or written. Hotel-entry credentials live in
   * `qr_credentials` (purpose "hotel_entry"), where only a hash is stored.
   * Relaxed to nullable in 0005 so new hotels need no raw token; the column
   * itself is kept rather than dropped so no existing row is destroyed. A
   * later migration can remove it once nothing in the record needs it.
   */
  qrToken: text("qr_token").unique(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Hotel = typeof hotels.$inferSelect;
export type NewHotel = typeof hotels.$inferInsert;
