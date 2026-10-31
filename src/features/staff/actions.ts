"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/authorization";
import { changeStaffRole } from "@/db/queries/staff-roles";

export type StaffRoleFormState = { ok: boolean; message: string } | null;

const staffRoleSchema = z.object({
  email: z.email("Enter the account's email address"),
  role: z.enum(["admin", "user"]),
});

/**
 * Grant or remove the platform-admin role. The current release has exactly two roles, so this is the whole of
 * "staff access". requireAdmin() runs first, and the database operation re-checks that the actor is an admin, that
 * they are not changing themselves, and that an administrator always remains — and writes the audit entry in the same
 * transaction. Hotel-scoped and partner-scoped roles are intentionally not part of this build.
 */
export async function changeStaffRoleFormAction(
  _previous: StaffRoleFormState,
  formData: FormData
): Promise<StaffRoleFormState> {
  const admin = await requireAdmin();

  const parsed = staffRoleSchema.safeParse({ email: formData.get("email") ?? "", role: formData.get("role") ?? "" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid input" };

  const result = await changeStaffRole({ actorUserId: admin.id, targetEmail: parsed.data.email, to: parsed.data.role });
  if (!result.ok) return { ok: false, message: result.message };

  revalidatePath("/admin/staff");
  return result.changed
    ? { ok: true, message: `${result.email} is now ${result.to === "admin" ? "a platform administrator" : "a regular guest account"}.` }
    : { ok: true, message: `${result.email} already has that role. Nothing changed.` };
}
