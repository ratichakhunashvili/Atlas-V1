import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { hotels } from "./hotels";
import { places } from "./places";
import { enumCheck } from "./sql-helpers";

export const FACILITY_TYPES = ["pool", "spa", "sauna", "gym", "dining", "room_service", "event", "other"] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];

export const FACILITY_STATUSES = ["active", "inactive"] as const;
export type FacilityStatus = (typeof FACILITY_STATUSES)[number];

// A facility OWNED by one hotel (its pool, spa, restaurant, …). Eligible for
// that hotel's guests without any external partnership — but never for any
// other hotel's guests. Still a canonical `places` row (one Place model);
// this table only says "this Place belongs to this hotel".
export const hotelFacilities = pgTable(
  "hotel_facilities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    hotelId: uuid("hotel_id")
      .notNull()
      .references(() => hotels.id, { onDelete: "cascade" }),
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "restrict" }),
    facilityType: text("facility_type").notNull().$type<FacilityType>(),
    status: text("status").notNull().default("active").$type<FacilityStatus>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A facility Place is owned by exactly one hotel.
    uniqueIndex("hotel_facilities_place_idx").on(table.placeId),
    index("hotel_facilities_hotel_status_idx").on(table.hotelId, table.status),
    check("hotel_facilities_type_check", enumCheck(table.facilityType, FACILITY_TYPES)),
    check("hotel_facilities_status_check", enumCheck(table.status, FACILITY_STATUSES)),
  ]
);

export type HotelFacility = typeof hotelFacilities.$inferSelect;
export type NewHotelFacility = typeof hotelFacilities.$inferInsert;
