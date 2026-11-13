import Link from "next/link";
import { listHotelsWithPlace } from "@/db/queries/hotels";
import { listFeedbackForAdmin } from "@/db/queries/plan-day-feedback";
import { ADMIN_FEEDBACK_PAGE_SIZE, adminFeedbackHref, parseAdminFeedbackParams, type AdminFeedbackParams } from "@/features/feedback/admin-filter";
import { FEEDBACK_SEGMENTS, SEGMENT_LABELS } from "@/features/feedback/segments";
import { requireAdmin } from "@/lib/authorization";
import { DAY_MONTH_YEAR } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Private guest feedback on finished plan days (Phase 2). Read-only, platform admins only: guests never see anyone's
 * feedback, and hotels do not see it here. Newest first; filter by hotel and by "has a note for" one segment, with the
 * average rating per segment for the whole filter. A missing rating means the guest said they didn't use that part.
 */
export const metadata = { title: "Guest feedback" };

function formatAverage(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

export default async function FeedbackAdminPage({ searchParams }: { searchParams: Promise<AdminFeedbackParams> }) {
  await requireAdmin();
  const [params, hotelRows] = await Promise.all([searchParams, listHotelsWithPlace()]);
  const hotels = [...new Map(hotelRows.map((row) => [row.id, row.place.name])).entries()].map(([id, name]) => ({ id, name }));
  const query = parseAdminFeedbackParams(params, new Set(hotels.map((hotel) => hotel.id)));
  const result = await listFeedbackForAdmin({ ...query, pageSize: ADMIN_FEEDBACK_PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(result.total / ADMIN_FEEDBACK_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Guest feedback</h1>
        <p className="text-sm text-slate-600">
          Private feedback guests give after a plan day. Only Atlas admins see it. Newest first; times are UTC.
        </p>
      </div>

      <form method="get" action="/admin/feedback" className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-800">Hotel</span>
          <select name="hotel" defaultValue={query.hotelId ?? ""} className="min-h-10 rounded border border-slate-300 bg-white px-2">
            <option value="">All hotels</option>
            {hotels.map((hotel) => (
              <option key={hotel.id} value={hotel.id}>
                {hotel.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-800">Only entries with a note for</span>
          <select name="note" defaultValue={query.noteFor ?? ""} className="min-h-10 rounded border border-slate-300 bg-white px-2">
            <option value="">Any segment (no note filter)</option>
            {FEEDBACK_SEGMENTS.map((segment) => (
              <option key={segment} value={segment}>
                {SEGMENT_LABELS[segment]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="min-h-10 rounded bg-slate-900 px-4 text-sm font-medium text-white">
          Filter
        </button>
        {query.hotelId || query.noteFor ? (
          <Link href="/admin/feedback" className="inline-flex min-h-10 items-center text-sm text-slate-700 underline">
            Clear filters
          </Link>
        ) : null}
      </form>

      <section aria-labelledby="averages-title" className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 id="averages-title" className="font-semibold text-slate-900">
          Averages for this filter ({result.total} {result.total === 1 ? "entry" : "entries"})
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          {FEEDBACK_SEGMENTS.map((segment) => (
            <div key={segment}>
              <dt className="text-xs text-slate-500">{SEGMENT_LABELS[segment]}</dt>
              <dd className="text-xl font-semibold tabular-nums text-slate-900">{formatAverage(result.averages[segment])}</dd>
              <p className="text-xs text-slate-500">{result.ratedCounts[segment]} rated</p>
            </div>
          ))}
        </dl>
      </section>

      {result.entries.length === 0 ? (
        <p className="text-sm text-slate-600">{result.total === 0 ? "No feedback matches this filter yet." : "There is nothing on this page."}</p>
      ) : (
        <ul className="space-y-3">
          {result.entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-slate-900">
                  {entry.hotelName} · {entry.guestEmail}
                </span>
                <time className="text-xs text-slate-500" dateTime={entry.createdAt.toISOString()}>
                  {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </time>
              </div>
              <p className="text-xs text-slate-600">
                Plan day {entry.dayNumber}, started {DAY_MONTH_YEAR.format(entry.dayStartedAt)}
              </p>
              <dl className="mt-3 space-y-2">
                {FEEDBACK_SEGMENTS.map((segment) => {
                  const answer = entry.segments[segment];
                  return (
                    <div key={segment} className={query.noteFor === segment ? "rounded bg-amber-50 p-2" : ""}>
                      <dt className="text-xs font-medium text-slate-700">{SEGMENT_LABELS[segment]}</dt>
                      <dd className="text-slate-900">
                        {answer.rating === null ? <span className="text-slate-500">Didn&apos;t use it</span> : `${answer.rating} / 5`}
                        {answer.note ? <p className="mt-1 whitespace-pre-wrap break-words text-slate-700">{answer.note}</p> : null}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
          {query.page > 1 ? (
            <Link href={adminFeedbackHref(query, query.page - 1)} className="inline-flex min-h-10 items-center rounded border border-slate-300 px-3">
              Newer
            </Link>
          ) : null}
          <span className="text-slate-600">
            Page {Math.min(query.page, pages)} of {pages}
          </span>
          {query.page < pages ? (
            <Link href={adminFeedbackHref(query, query.page + 1)} className="inline-flex min-h-10 items-center rounded border border-slate-300 px-3">
              Older
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
