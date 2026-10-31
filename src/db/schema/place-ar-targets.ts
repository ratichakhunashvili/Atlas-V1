import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { places } from "./places";

/**
 * The reference hash a guest's camera frame is compared against.
 *
 * **Its own table, deliberately.** Keeping it off `places` means every ordinary
 * Place read — the map, the experiences list, the itinerary snapshot — cannot
 * carry it by accident. A target hash that reached a browser would let anyone
 * submit a perfect match without pointing a camera at anything, so the safest
 * place for it is somewhere nothing routine selects from.
 *
 * **No image is stored.** Not the admin's reference photo, not the guest's
 * capture, not a thumbnail. The hash is computed in the admin's browser from a
 * file they choose, and only the 60-character hash is sent. There is nothing here
 * to leak, subpoena, or accidentally serve.
 */
export const placeArTargets = pgTable(
  "place_ar_targets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    /** A 240-bit difference hash as 60 lowercase hex characters (services/ar/hash.ts). */
    targetHash: text("target_hash").notNull(),
    /** A note for whoever maintains it: "the front entrance, from the square". Never an image. */
    description: text("description"),
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One target per Place: a second would make "which did it match?" ambiguous.
    unique("place_ar_targets_place_unique").on(table.placeId),
    // The shape this hash must have, enforced where it is stored rather than only
    // where it is written: a malformed target could never match anything, and a
    // guest would see an unexplainable failure.
    check(
      "place_ar_targets_hash_format_check",
      sql`${table.targetHash} ~ '^[0-9a-f]{60}$'`
    ),
  ]
);

export type PlaceArTarget = typeof placeArTargets.$inferSelect;
export type NewPlaceArTarget = typeof placeArTargets.$inferInsert;
