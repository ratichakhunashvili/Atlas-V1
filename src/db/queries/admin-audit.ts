import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditEvents, users } from "@/db/schema";
import {
  listRecentAuditEvents as listOperation,
  recordAdminAudit as recordOperation,
  type AuditInput,
} from "@/db/operations/admin-audit";

/** Thin binding of the production handle; the logic (and its secret-field guard) lives in db/operations/admin-audit.ts. */
export async function recordAdminAudit(input: AuditInput) {
  return recordOperation(db, input);
}

export async function listRecentAuditEvents(input: { limit?: number; hotelId?: string } = {}) {
  return listOperation(db, input);
}

/** The audit log for the admin screen: newest first, with the acting admin's email resolved (null once that account is gone). */
export async function listAuditLogWithActors(limit = 100) {
  return db
    .select({
      id: adminAuditEvents.id,
      action: adminAuditEvents.action,
      targetType: adminAuditEvents.targetType,
      targetId: adminAuditEvents.targetId,
      hotelId: adminAuditEvents.hotelId,
      before: adminAuditEvents.before,
      after: adminAuditEvents.after,
      reason: adminAuditEvents.reason,
      occurredAt: adminAuditEvents.occurredAt,
      actorEmail: users.email,
    })
    .from(adminAuditEvents)
    .leftJoin(users, eq(users.id, adminAuditEvents.actorUserId))
    .orderBy(desc(adminAuditEvents.occurredAt))
    .limit(Math.min(Math.max(limit, 1), 200));
}
