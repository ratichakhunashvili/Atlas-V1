import Link from "next/link";
import { hotelEngagement } from "@/db/queries/admin-metrics";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const PERIODS = [7, 30, 90] as const;

/**
 * Aggregate engagement per hotel for a chosen period. Counts only: no guest identity, no locations, no per-person
 * trail. Everything shown is a count of rows Atlas recorded; what it does not record is listed at the bottom rather
 * than filled with an estimate.
 */
export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const { days } = await searchParams;
  const period = (PERIODS as readonly number[]).includes(Number(days)) ? Number(days) : 30;

  const until = new Date();
  const since = new Date(until.getTime() - period * DAY_MS);
  const hotels = await hotelEngagement({ since, until });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Engagement by hotel</h1>
        <p className="text-sm text-slate-600">
          {since.toISOString().slice(0, 10)} to {until.toISOString().slice(0, 10)} (UTC), the last {period} days.
        </p>
        <nav aria-label="Period" className="mt-3 flex gap-2">
          {PERIODS.map((value) => (
            <Link
              key={value}
              href={`/admin/analytics?days=${value}`}
              aria-current={value === period ? "page" : undefined}
              className={`inline-flex min-h-10 items-center rounded-full border px-4 text-sm ${
                value === period ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              {value} days
            </Link>
          ))}
        </nav>
      </div>

      {hotels.length === 0 ? (
        <p className="text-sm text-slate-600">There are no hotels yet.</p>
      ) : (
        <div className="space-y-4">
          {hotels.map((hotel) => (
            <section key={hotel.hotelId} aria-labelledby={`h-${hotel.hotelId}`} className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 id={`h-${hotel.hotelId}`} className="font-semibold text-slate-900">
                {hotel.hotelName}
              </h2>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
                <Metric label="Stays started" value={hotel.staysStarted} note="Hotel entries: QR entries, test entries and hotel switches" />
                <Metric label="Plans generated" value={hotel.itinerariesGenerated} />
                <Metric label="Plans completed" value={hotel.itinerariesCompleted} />
                <Metric label="Verified stop visits" value={hotel.verifiedStopVisits} />
                <Metric label="…at hotel facilities" value={hotel.facilityVisits} />
                <Metric label="…at approved partners" value={hotel.partnerVisits} />
                <Metric
                  label="…at places no longer related"
                  value={hotel.unclassifiedVisits}
                  note="Relationship has since ended"
                />
                <Metric label="Guests who planned on 2+ days" value={hotel.repeatUseStays} note="Repeat use during a stay" />
              </dl>
            </section>
          ))}
        </div>
      )}

      <aside className="rounded-lg border border-dashed border-slate-300 p-4 text-xs text-slate-600">
        <p className="font-medium text-slate-800">What this does not show</p>
        <ul className="mt-1 list-disc space-y-1 pl-4">
          <li>Place views and selections on the map: Atlas does not record them, so there is no number to show.</li>
          <li>Reliability or error rates: no failure events are recorded yet.</li>
          <li>Individual guests or locations: these figures are aggregates by design.</li>
          <li>
            Facility and partner visits are classified by today&apos;s relationships, since a visit does not store which
            relationship justified it.
          </li>
        </ul>
      </aside>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums text-slate-900">{value}</dd>
      {note && <p className="text-xs text-slate-500">{note}</p>}
    </div>
  );
}
