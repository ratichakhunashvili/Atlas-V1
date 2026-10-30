import { sql } from "drizzle-orm";
import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * The administrative actions that are audited, and the only ones.
 *
 * A closed list on purpose: an audit trail that can record anything records nothing useful, and each entry here is
 * a decision that the action is sensitive enough to answer "who did this, to what, and when" later.
 */
export const ADMIN_AUDIT_ACTIONS = [
  "partnership.proposed",
  "partnership.confirmed",
  "partnership.suspended",
  "partnership.revoked",
  "partnership.reopened",
  "place.created",
  "place.published",
  "place.unpublished",
  "place.verified",
  "place.unverified",
  "place.archived",
  "place.unarchived",
  "place.deleted",
  "qr_credential.issued",
  "qr_credential.rotated",
  "qr_credential.revoked",
  "model.saved",
  "model.enabled",
  "model.disabled",
  "model.deleted",
  "staff.role_changed",
  "support.guest_lookup",
] as const;
export type AdminAuditAction = (typeof ADMIN_AUDIT_ACTIONS)[number];

/**
 * One sensitive admin mutation: who (`actor_user_id`), what (`action`), to which record (`target_type` +
 * `target_id`), when, and the minimal before/after state that changed.
 *
 * APPEND-ONLY, enforced by the database (migration 0016 installs a trigger that refuses UPDATE and DELETE): an audit
 * row that an admin can edit is not an audit row. The actor is SET NULL when an account is deleted, so history
 * outlives the person without anyone being able to rewrite what they did.
 *
 * `before` / `after` hold only the fields that changed (a status, a window, a role) — callers choose them
 * explicitly. They never hold a raw QR token, a token hash, a password hash or a private AR reference.
 */
export const adminAuditEvents = pgTable(
  "admin_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull().$type<AdminAuditAction>(),
    targetType: text("target_type").notNull(),
    /** Text, not a uuid FK: the target may later be deleted or may not be a uuid at all (an email lookup is audited by user id). */
    targetId: text("target_id").notNull(),
    /** The hotel the action concerned, when it has one — lets a hotel's history be read without joining every target type. */
    hotelId: uuid("hotel_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    /** Why, when an operational reason is required (guest support). */
    reason: text("reason"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("admin_audit_events_action_check", sql`${table.action} in (${sql.raw(ADMIN_AUDIT_ACTIONS.map((a) => `'${a}'`).join(", "))})`),
    check("admin_audit_events_reason_length_check", sql`${table.reason} is null or char_length(${table.reason}) <= 500`),
    index("admin_audit_events_occurred_idx").on(table.occurredAt),
    index("admin_audit_events_target_idx").on(table.targetType, table.targetId),
    index("admin_audit_events_hotel_idx").on(table.hotelId, table.occurredAt),
  ]
);

export type AdminAuditEvent = typeof adminAuditEvents.$inferSelect;
export type NewAdminAuditEvent = typeof adminAuditEvents.$inferInsert;
