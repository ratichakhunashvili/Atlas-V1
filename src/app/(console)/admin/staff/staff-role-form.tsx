"use client";

import { useActionState } from "react";
import { Button } from "@/components/shared/button";
import { changeStaffRoleFormAction, type StaffRoleFormState } from "@/features/staff/actions";

export function StaffRoleForm() {
  const [state, formAction, pending] = useActionState<StaffRoleFormState, FormData>(changeStaffRoleFormAction, null);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4" aria-label="Change an account's role">
      <h2 className="text-sm font-semibold text-slate-900">Grant or remove administrator access</h2>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">Account email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="off"
          className="block min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">Role</span>
        <select name="role" defaultValue="admin" className="block min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm">
          <option value="admin">Platform administrator</option>
          <option value="user">Regular guest account</option>
        </select>
      </label>
      <p className="text-xs text-slate-500">
        You can&apos;t change your own role, and the last administrator can&apos;t be removed. Every change is recorded in the
        audit log.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Apply"}
      </Button>
      {state && (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "text-sm text-green-700" : "text-sm text-red-600"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
