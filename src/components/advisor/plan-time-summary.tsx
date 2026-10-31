import type { PlanTimeSummary } from "@/services/advisor/time-budget";

/**
 * Two facts, side by side: how much of the guest's time is left, and how much the
 * rest of their plan still asks for.
 *
 * They are shown separately on purpose. Collapsing them into one friendly figure is
 * how an interface ends up implying a day fits when it does not, and a guest who is
 * told "70 minutes of walking left" when they have 40 finds out the hard way, at the
 * far end of the route.
 *
 * When the plan no longer fits, this says so plainly and hands the decision back:
 * Atlas does not quietly drop a stop to make the arithmetic agree. The guest can
 * walk it anyway, take longer, or change the plan themselves.
 */
export function PlanTimeSummaryPanel({ time }: { time: PlanTimeSummary }) {
  const { plannedMinutes, remainingMinutes, fitsRemaining, overBudgetByMinutes } = time;

  return (
    <div className="mt-2 space-y-1">
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
        <div className="flex gap-1">
          <dt className="text-slate-500">Time left:</dt>
          <dd className="font-medium text-slate-900">
            {remainingMinutes === null ? "not tracked for this plan" : formatMinutes(remainingMinutes)}
          </dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-slate-500">Plan still needs:</dt>
          <dd className="font-medium text-slate-900">about {formatMinutes(plannedMinutes)}</dd>
        </div>
      </dl>

      {fitsRemaining === false && (
        <p
          // Announced when it appears: a guest reading with a screen reader should
          // not have to go looking for the reason their plan stopped adding up.
          role="status"
          className="rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-900"
        >
          <span className="font-medium">This plan no longer fits your time.</span> It needs about{" "}
          {formatMinutes(overBudgetByMinutes ?? 0)} more than you have left. Nothing has been changed or removed —
          you can keep going, or update the plan yourself.
        </p>
      )}

      {remainingMinutes === null && (
        <p className="text-xs text-slate-500">
          This plan was made before Atlas asked how much free time you had, so there is no window to measure it
          against.
        </p>
      )}

      <p className="text-xs text-slate-400">
        Walking time covers the whole route, including the parts you have already walked — so it is a generous
        estimate, not a countdown.
      </p>
    </div>
  );
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "no time";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}
