import "server-only";
import { db } from "@/db";
import { changeStaffRole as changeOperation, listStaffAccounts as listOperation } from "@/db/operations/staff-roles";
import type { UserRole } from "@/db/schema";

/** Thin bindings; every guard (actor is admin, no self-change, last-admin) lives in db/operations/staff-roles.ts. */
export async function changeStaffRole(input: { actorUserId: string; targetEmail: string; to: UserRole }) {
  return changeOperation(db, input);
}

export async function listStaffAccounts() {
  return listOperation(db);
}
