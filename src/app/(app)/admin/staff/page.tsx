import { listStaffAccounts } from "@/db/queries/staff-roles";
import { requireAdmin } from "@/lib/authorization";
import { StaffRoleForm } from "./staff-role-form";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  const me = await requireAdmin();
  const admins = await listStaffAccounts();

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Staff access</h1>
        <p className="text-sm text-slate-600">
          Atlas currently has two roles: guest and platform administrator. Hotel-manager and partner-manager roles are not
          available yet, so there is nothing scoped to configure here.
        </p>
      </div>

      <section aria-labelledby="admins-heading" className="space-y-2">
        <h2 id="admins-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Platform administrators ({admins.length})
        </h2>
        <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white text-sm">
          {admins.map((admin) => (
            <li key={admin.id} className="flex items-center justify-between gap-2 px-4 py-3">
              <span className="break-all font-medium text-slate-900">{admin.email}</span>
              {admin.id === me.id && <span className="shrink-0 text-xs text-slate-500">you</span>}
            </li>
          ))}
        </ul>
      </section>

      <StaffRoleForm />
    </div>
  );
}
