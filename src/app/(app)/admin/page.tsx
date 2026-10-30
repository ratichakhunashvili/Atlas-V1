import Link from "next/link";
import { Card } from "@/components/shared/card";
import { listRecentAuditEvents } from "@/db/queries/admin-audit";
import {
  dashboardCounts,
  hotelNamesById,
  listPendingPartnershipQueue,
  recentUse,
} from "@/db/queries/admin-metrics";

export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 7;

function Stat({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <Card className="space-y-1">
      <p className="text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      <p className="text-sm font-medium text-slate-700">{label}</p>
      {note && <p className="text-xs text-slate-500">{note}</p>}
    </Card>
  );
}

/**
 * The operational dashboard. Every number is a count over rows Atlas actually holds, with its date range printed
 * beside it; there are no placeholders and nothing is estimated. The layout (admin/layout.tsx) has already required
 * the admin role.
 */
export default async function AdminHomePage() {
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);

  const [counts, use, queue, hotelNames, audit] = await Promise.all([
    dashboardCounts(now),
    recentUse({ since, until: now }),
    listPendingPartnershipQueue(),
    hotelNamesById(),
    listRecentAuditEvents({ limit: 8 }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <p className="text-sm text-slate-600">
          Counts as of {now.toISOString().slice(0, 16).replace("T", " ")} UTC. Activity figures cover the last {WINDOW_DAYS}{" "}
          days.
        </p>
      </div>

      <section aria-labelledby="catalog-heading" className="space-y-3">
        <h2 id="catalog-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Catalog and relationships (right now)
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Hotels" value={counts.hotels} />
          <Stat
            label="Published and verified Places"
            value={counts.eligibleCapablePlaces}
            note="Not archived. Still needs a hotel relationship to reach any guest."
          />
          <Stat label="Active partnerships" value={counts.activePartnerships} note="Confirmed and inside their date window." />
          <Stat label="Pending partnership decisions" value={counts.pendingPartnerships} />
          <Stat label="Upcoming hotel events" value={counts.upcomingEvents} note="Scheduled, not yet started." />
          <Stat label="Usable QR credentials" value={counts.activeCredentials} note="Not revoked, not expired." />
          <Stat label="Revoked QR credentials" value={counts.revokedCredentials} />
          <Stat label="Platform admins" value={counts.admins} />
        </div>
      </section>

      <section aria-labelledby="activity-heading" className="space-y-3">
        <h2 id="activity-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Guest activity (last {WINDOW_DAYS} days)
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Plans generated" value={use.itinerariesGenerated} />
          <Stat label="Verified stop visits" value={use.verifiedStopVisits} note="Completed through QR, GPS or camera check-in." />
        </div>
        <p className="text-xs text-slate-500">
          <Link href="/admin/analytics" className="underline">
            Per-hotel engagement
          </Link>{" "}
          shows the same by hotel. Aggregates only: no guest identities or locations.
        </p>
      </section>

      <section aria-labelledby="queue-heading" className="space-y-3">
        <h2 id="queue-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Needs your decision
        </h2>
        {queue.length === 0 ? (
          <p className="text-sm text-slate-600">No partnership proposals are waiting.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
            {queue.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span>
                  <span className="font-medium text-slate-900">{item.placeName}</span>{" "}
                  <span className="text-slate-500">proposed for {hotelNames.get(item.hotelId) ?? "a hotel"}</span>
                </span>
                <Link
                  href={`/admin/hotels/${item.hotelId}/partnerships`}
                  className="inline-flex min-h-10 items-center text-slate-800 underline underline-offset-4"
                >
                  Review
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="audit-heading" className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 id="audit-heading" className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Recent admin changes
          </h2>
          <Link href="/admin/audit" className="text-sm text-slate-700 underline underline-offset-4">
            Full audit log
          </Link>
        </div>
        {audit.length === 0 ? (
          <p className="text-sm text-slate-600">Nothing has been audited yet.</p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white text-sm">
            {audit.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <span className="font-medium text-slate-800">{event.action}</span>
                <time className="text-xs text-slate-500" dateTime={event.occurredAt.toISOString()}>
                  {event.occurredAt.toISOString().slice(0, 16).replace("T", " ")} UTC
                </time>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
