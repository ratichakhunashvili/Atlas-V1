import { eq, sql } from "drizzle-orm";
import { adminAuditEvents, users, type UserRole } from "@/db/schema";
import type { AtlasDatabase } from "./types";

export type RoleChangeResult =
  | { ok: true; changed: boolean; email: string; from: UserRole; to: UserRole }
  | { ok: false; reason: "not_found" | "self_change" | "last_admin"; message: string };

/**
 * Promotes or demotes ONE account, safely, in a single transaction that also writes the audit entry.
 *
 * Guards, all re-checked here against the database rather than trusted from the page that offered the button:
 *  - the actor must currently BE an admin (a stale session cannot promote anyone);
 *  - nobody changes their own role (no accidental self-lockout, no self-escalation path);
 *  - the last remaining admin can never be demoted, so the console cannot lock everyone out.
 *
 * The admin rows are locked FOR UPDATE for the duration, so two concurrent demotions cannot each see "another admin
 * exists" and together remove the last two.
 */
export async function changeStaffRole(
  db: AtlasDatabase,
  input: { actorUserId: string; targetEmail: string; to: UserRole; now?: Date }
): Promise<RoleChangeResult> {
  return db.transaction(async (tx) => {
    // Lock every admin row (and, when promoting, the target) so the counts below cannot change under us.
    const admins = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"))
      .for("update");

    if (!admins.some((admin) => admin.id === input.actorUserId)) {
      return { ok: false, reason: "not_found", message: "Your account is not an administrator." } as const;
    }

    const [target] = await tx
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(sql`lower(${users.email})`, input.targetEmail.trim().toLowerCase()))
      .for("update")
      .limit(1);
    if (!target) return { ok: false, reason: "not_found", message: "No account has that email." } as const;

    if (target.id === input.actorUserId) {
      return { ok: false, reason: "self_change", message: "You can't change your own role. Ask another administrator." } as const;
    }

    if (target.role === input.to) {
      return { ok: true, changed: false, email: target.email, from: target.role, to: input.to } as const;
    }

    if (target.role === "admin" && input.to !== "admin" && admins.length <= 1) {
      return { ok: false, reason: "last_admin", message: "That is the last administrator, so it can't be demoted." } as const;
    }

    await tx.update(users).set({ role: input.to, updatedAt: input.now ?? new Date() }).where(eq(users.id, target.id));

    await tx.insert(adminAuditEvents).values({
      actorUserId: input.actorUserId,
      action: "staff.role_changed",
      targetType: "user",
      targetId: target.id,
      before: { role: target.role },
      after: { role: input.to },
      ...(input.now ? { occurredAt: input.now } : {}),
    });

    return { ok: true, changed: true, email: target.email, from: target.role, to: input.to } as const;
  });
}

export async function listStaffAccounts(db: AtlasDatabase) {
  return db
    .select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.role, "admin"))
    .orderBy(users.email);
}
