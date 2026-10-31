"use client";

import { useActionState } from "react";
import { Button } from "@/components/shared/button";
import { updateStayDatesFormAction, type StayDatesFormState } from "@/features/hotel-stays/actions";

export type StayDatesView = {
  /** "YYYY-MM-DD" */
  checkInDate: string;
  /** "YYYY-MM-DD", or null when no departure has been declared yet. */
  expectedCheckOutDate: string | null;
  datesSource: "guest_declared" | "verified";
  /** True once the guest has a plan: the arrival date can no longer move, the departure can. */
  arrivalLocked: boolean;
  /** Which day of the stay today is, from the server's own clock; null if outside the declared stay. */
  dayNumber: number | null;
};

/**
 * The stay-dates editor shown inside the stay sheet. The server validates and persists; this only collects two
 * dates. Labels say plainly that the dates are the guest's own declaration unless a verified source supplied them.
 */
export function StayDatesForm({ stay }: { stay: StayDatesView }) {
  const [state, formAction, pending] = useActionState<StayDatesFormState, FormData>(updateStayDatesFormAction, null);
  const verified = stay.datesSource === "verified";

  return (
    <form action={formAction} className="atlas-stay-dates" aria-label="Stay dates">
      <p className="atlas-panel-meta">
        {verified ? "Dates verified with your hotel" : "Dates you declared — not verified with your hotel"}
        {stay.dayNumber !== null && ` · Today is day ${stay.dayNumber} of your stay`}
      </p>

      <label className="atlas-field">
        <span>Arrival</span>
        <input type="date" name="checkIn" required defaultValue={stay.checkInDate} readOnly={stay.arrivalLocked || verified} />
      </label>
      <label className="atlas-field">
        <span>Departure (last day)</span>
        <input
          type="date"
          name="expectedCheckOut"
          required
          defaultValue={stay.expectedCheckOutDate ?? ""}
          readOnly={verified}
        />
      </label>

      {stay.arrivalLocked && !verified && (
        <p className="atlas-panel-meta">
          Your arrival is fixed because you have a plan — plans are numbered by day of stay. You can still move your departure.
        </p>
      )}

      {!verified && (
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save dates"}
        </Button>
      )}

      {state && (
        <p role={state.ok ? "status" : "alert"} className={state.ok ? "atlas-panel-meta" : "atlas-panel-meta atlas-panel-error"}>
          {state.message}
        </p>
      )}
    </form>
  );
}
