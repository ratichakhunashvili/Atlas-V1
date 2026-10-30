import { desc, eq } from "drizzle-orm";
import { adminAuditEvents, type AdminAuditAction } from "@/db/schema";
import type { AtlasDatabase } from "./types";

/**
 * Field names that must never appear in an audit snapshot. A raw QR token, its hash, a password hash or a private
 * AR reference in the audit trail would turn a record meant for accountability into a place secrets leak from, so
 * recording one is a programming error that throws instead of being quietly stored.
 */
const FORBIDDEN_KEY_PATTERN = /token|hash|password|secret|credential_value|ar_reference/i;

function assertNoSecretFields(snapshot: Record<string, unknown> | null | undefined, label: string) {
  if (!snapshot) return;
  for (const key of Object.keys(snapshot)) {
    if (FORBIDDEN_KEY_PATTERN.test(key)) {
      throw new Error(`Refusing to audit a "${key}" field in ${label}: secrets never go in the audit trail.`);
    }
  }
}

export type AuditInput = {
  actorUserId: string;
  action: AdminAuditAction;
  targetType: string;
  targetId: string;
  hotelId?: string | null;
  /** Only the fields that changed, chosen by the caller. */
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  now?: Date;
};

/**
 * Appends one audit event. Pass a transaction handle to record it atomically with the change it describes, so the
 * trail can never disagree with what actually happened.
 */
export async function recordAdminAudit(db: AtlasDatabase, input: AuditInput) {
  assertNoSecretFields(input.before, "before");
  assertNoSecretFields(input.after, "after");

  const [event] = await db
    .insert(adminAuditEvents)
    .values({
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      hotelId: input.hotelId ?? null,
      before: input.before ?? null,
      after: input.after ?? null,
      reason: input.reason ?? null,
      ...(input.now ? { occurredAt: input.now } : {}),
    })
    .returning();
  return event;
}

export async function listRecentAuditEvents(db: AtlasDatabase, input: { limit?: number; hotelId?: string } = {}) {
  const query = db.select().from(adminAuditEvents);
  const filtered = input.hotelId ? query.where(eq(adminAuditEvents.hotelId, input.hotelId)) : query;
  return filtered.orderBy(desc(adminAuditEvents.occurredAt)).limit(Math.min(Math.max(input.limit ?? 25, 1), 200));
}
