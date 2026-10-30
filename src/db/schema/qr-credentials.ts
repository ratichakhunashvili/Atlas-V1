import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { hotels } from "./hotels";
import { places } from "./places";
import { enumCheck } from "./sql-helpers";

/**
 * What a credential is allowed to do. The purpose is stored WITH the
 * credential and checked on every resolution, so a hotel-entry code can
 * never start a Place check-in and a Place code can never start a stay —
 * even though both are just opaque strings in a QR image.
 */
export const QR_PURPOSES = ["hotel_entry", "place_check_in"] as const;
export type QrPurpose = (typeof QR_PURPOSES)[number];

/**
 * One QR credential. The raw token is NEVER stored: it is shown once, at
 * generation, and only its SHA-256 hash is kept here.
 *
 * SHA-256 rather than bcrypt deliberately. These tokens are 256 bits of
 * `crypto.randomBytes`, not user-chosen passwords, so there is nothing to
 * brute-force and no need for a slow KDF; a fast digest is also what lets a
 * scan be resolved with one indexed lookup instead of a table scan comparing
 * every row. See services/qr/token.ts.
 *
 * Expiry defaults to null (approved 2026-10-14): these codes get printed and
 * mounted on a wall, so they end by explicit revocation or rotation, not by
 * quietly dying on a date nobody recorded. The column and its check exist so
 * a bounded credential can be issued when a purpose needs one.
 */
export const qrCredentials = pgTable(
  "qr_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    purpose: text("purpose").notNull().$type<QrPurpose>(),
    // Exactly one of these is set, decided by `purpose` (CHECK below). Cascade:
    // a credential is meaningless without its subject, and the subject's own
    // deletion rules (places is RESTRICT where history exists) still apply.
    hotelId: uuid("hotel_id").references(() => hotels.id, { onDelete: "cascade" }),
    placeId: uuid("place_id").references(() => places.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    // Who issued it, for the audit trail. Kept as a plain id (no FK) so a
    // deleted admin account can never erase the record of an issued credential.
    createdByUserId: uuid("created_by_user_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("qr_credentials_purpose_check", enumCheck(table.purpose, QR_PURPOSES)),
    // The purpose and the subject must agree: a hotel_entry credential points at a
    // hotel and nothing else, a place_check_in credential at a Place and nothing else.
    // This is what makes "purpose-bound" a database fact rather than a convention.
    check(
      "qr_credentials_subject_matches_purpose_check",
      sql`(${table.purpose} = 'hotel_entry' and ${table.hotelId} is not null and ${table.placeId} is null)
          or (${table.purpose} = 'place_check_in' and ${table.placeId} is not null and ${table.hotelId} is null)`
    ),
    // At most one live credential per hotel and per Place. Rotation is therefore
    // revoke-then-issue in one transaction, and two valid codes for the same door
    // can never exist by accident.
    uniqueIndex("qr_credentials_active_hotel_idx")
      .on(table.hotelId)
      .where(sql`${table.revokedAt} is null and ${table.hotelId} is not null`),
    uniqueIndex("qr_credentials_active_place_idx")
      .on(table.placeId)
      .where(sql`${table.revokedAt} is null and ${table.placeId} is not null`),
    index("qr_credentials_purpose_idx").on(table.purpose),
  ]
);

export type QrCredential = typeof qrCredentials.$inferSelect;
export type NewQrCredential = typeof qrCredentials.$inferInsert;
