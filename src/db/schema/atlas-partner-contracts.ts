import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { places } from "./places";
import { enumCheck } from "./sql-helpers";
import { users } from "./users";

export const ATLAS_CONTRACT_STATUSES = ["pending_review", "active", "suspended", "ended"] as const;
export type AtlasContractStatus = (typeof ATLAS_CONTRACT_STATUSES)[number];

// A business's contract with ATLAS itself (docs/catalogue-model-plan.md). In the catalogue model an active, confirmed,
// in-window contract is what puts a business in front of every hotel's guests; a hotel partnership only promotes a
// business that already has one. Phase C1 stores and manages contracts — guest eligibility does not read them yet.
//
// History is kept: a Place may have many contract rows over time, but at most ONE that is active (partial unique
// index below). "Expired" is never stored; it is derived from `ends_at`, as for hotel partnerships.
export const atlasPartnerContracts = pgTable(
  "atlas_partner_contracts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // RESTRICT: a Place with contract history cannot be hard-deleted. Archive it instead.
    placeId: uuid("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("pending_review").$type<AtlasContractStatus>(),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    // SET NULL so deleting the admin account never deletes or invalidates the contract record.
    confirmedBy: uuid("confirmed_by").references(() => users.id, { onDelete: "set null" }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("atlas_partner_contracts_place_idx").on(table.placeId),
    // At most one live contract per Place, so "is this business in the network?" has exactly one answer.
    uniqueIndex("atlas_partner_contracts_one_active_idx")
      .on(table.placeId)
      .where(sql`${table.status} = 'active'`),
    // At most one open proposal per Place, so two admins can't queue duplicate reviews.
    uniqueIndex("atlas_partner_contracts_one_pending_idx")
      .on(table.placeId)
      .where(sql`${table.status} = 'pending_review'`),
    check("atlas_partner_contracts_status_check", enumCheck(table.status, ATLAS_CONTRACT_STATUSES)),
    check(
      "atlas_partner_contracts_active_requires_confirmation_check",
      sql`${table.status} <> 'active' or ${table.confirmedAt} is not null`
    ),
    check("atlas_partner_contracts_ended_requires_date_check", sql`${table.status} <> 'ended' or ${table.endedAt} is not null`),
    check(
      "atlas_partner_contracts_window_check",
      sql`${table.startsAt} is null or ${table.endsAt} is null or ${table.endsAt} > ${table.startsAt}`
    ),
  ]
);

export type AtlasPartnerContract = typeof atlasPartnerContracts.$inferSelect;
export type NewAtlasPartnerContract = typeof atlasPartnerContracts.$inferInsert;
