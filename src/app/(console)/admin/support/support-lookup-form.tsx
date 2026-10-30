"use client";

import { useActionState } from "react";
import { Button } from "@/components/shared/button";
import { lookupGuestAction, type SupportLookupState } from "@/features/support/actions";

type Reason = { code: string; label: string };

function date(value: string) {
  return value.slice(0, 10);
}

export function SupportLookupForm({ reasons }: { reasons: readonly Reason[] }) {
  const [state, formAction, pending] = useActionState<SupportLookupState, FormData>(lookupGuestAction, null);

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4" aria-label="Find a guest">
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Guest&apos;s exact email</span>
          <input name="email" type="email" required autoComplete="off" className="block min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm" />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Why are you looking? (required, recorded)</span>
          <select name="reason" required defaultValue="" className="block min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm">
            <option value="" disabled>
              Choose a reason…
            </option>
            {reasons.map((reason) => (
              <option key={reason.code} value={reason.code}>
                {reason.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Note (optional)</span>
          <input name="note" maxLength={200} className="block min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm" />
        </label>
        <p className="text-xs text-slate-500">
          Every lookup is written to the audit log with your name and this reason. Matching is exact; there is no browsing.
        </p>
        <Button type="submit" disabled={pending}>
          {pending ? "Looking…" : "Look up guest"}
        </Button>
      </form>

      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-600">
          {state.message}
        </p>
      )}

      {state?.ok && (
        <section aria-label="Guest summary" className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 text-sm">
          <p className="text-xs text-slate-500">
            Account created {date(state.account.createdAt)} · role: {state.account.role}
          </p>

          <div>
            <h2 className="font-semibold text-slate-900">Current stay</h2>
            {state.activeStay ? (
              <p className="text-slate-700">
                {state.activeStay.hotelName} · arrival {date(state.activeStay.checkIn)}
                {state.activeStay.expectedCheckOut ? ` · departure ${date(state.activeStay.expectedCheckOut)}` : " · no departure declared"}
                <span className="block text-xs text-slate-500">
                  Dates are {state.activeStay.datesSource === "verified" ? "verified" : "the guest's own declaration, not verified"}.
                </span>
              </p>
            ) : (
              <p className="text-slate-600">No active stay.</p>
            )}
          </div>

          <div>
            <h2 className="font-semibold text-slate-900">Plans (latest {state.planDays.length})</h2>
            {state.planDays.length === 0 ? (
              <p className="text-slate-600">No plan has been generated.</p>
            ) : (
              <ul className="space-y-1 text-slate-700">
                {state.planDays.map((day) => (
                  <li key={day.dayNumber}>
                    Day {day.dayNumber} · generated {date(day.generatedAt)} · {day.completedStops} of {day.activeStops} stops completed
                    {day.completed && " · finished"}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-slate-700">Places visited (verified, all stays): {state.verifiedPlaceCount}</p>
          <p className="text-xs text-slate-500">
            Stop names, coordinates, routes and location readings are deliberately not shown here.
          </p>
        </section>
      )}
    </div>
  );
}
