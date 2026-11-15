import Link from "next/link";
import { listHotelsWithPlace } from "@/db/queries/hotels";
import { listFeedbackForAdmin } from "@/db/queries/plan-day-feedback";
import {
  ADMIN_FEEDBACK_PAGE_SIZE,
  adminFeedbackHref,
  parseAdminFeedbackParams,
  type AdminFeedbackParams,
} from "@/features/feedback/admin-filter";
import {
  FEEDBACK_SEGMENTS,
  FEEDBACK_TOPICS,
  SEGMENT_LABELS,
  TOPIC_LABELS,
} from "@/features/feedback/segments";
import { requireAdmin } from "@/lib/authorization";
import { DAY_MONTH_YEAR } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * Private guest feedback on finished plan days (Phase 2). Read-only, platform admins only: guests never see anyone's
 * feedback, and hotels do not see it here. Newest first; each entry is a topic and the guest's comment. Filter by hotel,
 * topic and guest, with how many entries name each topic. Entries from the earlier seven-rating form are shown as they
 * were given.
 */
export const metadata = { title: "Guest feedback" };

export default async function FeedbackAdminPage({
  searchParams,
}: {
  searchParams: Promise<AdminFeedbackParams>;
}) {
  await requireAdmin();
  const [params, hotelRows] = await Promise.all([
    searchParams,
    listHotelsWithPlace(),
  ]);
  const hotels = [
    ...new Map(hotelRows.map((row) => [row.id, row.place.name])).entries(),
  ].map(([id, name]) => ({ id, name }));
  const query = parseAdminFeedbackParams(
    params,
    new Set(hotels.map((hotel) => hotel.id)),
  );
  const result = await listFeedbackForAdmin({
    ...query,
    pageSize: ADMIN_FEEDBACK_PAGE_SIZE,
  });
  const pages = Math.max(1, Math.ceil(result.total / ADMIN_FEEDBACK_PAGE_SIZE));
  // Whose feedback this is, when filtered to one guest. Read from the entries, so an unknown id just shows nothing.
  const guestEmail = query.guestId
    ? (result.entries[0]?.guestEmail ?? null)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Guest feedback</h1>
        <p className="text-sm text-slate-600">
          Private feedback guests give after a plan day. Only Atlas admins see
          it. Newest first; times are UTC. Click a guest&apos;s email to see all
          of their feedback.
        </p>
      </div>

      {query.guestId ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm">
          <span className="text-slate-900">
            All feedback from{" "}
            <span className="font-medium break-all">
              {guestEmail ?? "this guest"}
            </span>
          </span>
          <Link
            href={adminFeedbackHref({ ...query, guestId: undefined }, 1)}
            className="atlas-hit text-slate-700 underline"
          >
            Show all guests
          </Link>
        </div>
      ) : null}

      <form
        method="get"
        action="/admin/feedback"
        className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-4"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-800">Hotel</span>
          <select
            name="hotel"
            defaultValue={query.hotelId ?? ""}
            className="min-h-10 rounded border border-slate-300 bg-white px-2"
          >
            <option value="">All hotels</option>
            {hotels.map((hotel) => (
              <option key={hotel.id} value={hotel.id}>
                {hotel.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-slate-800">Topic</span>
          <select
            name="topic"
            defaultValue={query.topic ?? ""}
            className="min-h-10 rounded border border-slate-300 bg-white px-2"
          >
            <option value="">All topics</option>
            {FEEDBACK_TOPICS.map((topic) => (
              <option key={topic} value={topic}>
                {TOPIC_LABELS[topic]}
              </option>
            ))}
          </select>
        </label>
        {query.guestId ? (
          <input type="hidden" name="guest" value={query.guestId} />
        ) : null}
        <button
          type="submit"
          className="min-h-10 rounded bg-slate-900 px-4 text-sm font-medium text-white"
        >
          Filter
        </button>
        {query.hotelId || query.topic || query.guestId ? (
          <Link
            href="/admin/feedback"
            className="inline-flex min-h-10 items-center text-sm text-slate-700 underline"
          >
            Clear filters
          </Link>
        ) : null}
      </form>

      <section
        aria-labelledby="topics-title"
        className="rounded-lg border border-slate-200 bg-white p-4"
      >
        <h2 id="topics-title" className="font-semibold text-slate-900">
          {result.total} {result.total === 1 ? "entry" : "entries"} · by topic
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          {FEEDBACK_TOPICS.map((topic) => (
            <div
              key={topic}
              className={query.topic === topic ? "rounded bg-amber-50 p-1" : ""}
            >
              <dt className="text-xs text-slate-500">{TOPIC_LABELS[topic]}</dt>
              <dd className="text-xl font-semibold tabular-nums text-slate-900">
                {result.topicCounts[topic]}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {result.entries.length === 0 ? (
        <p className="text-sm text-slate-600">
          {result.total === 0
            ? "No feedback matches this filter yet."
            : "There is nothing on this page."}
        </p>
      ) : (
        <ul className="space-y-3">
          {result.entries.map((entry) => (
            <li
              key={entry.id}
              className="rounded-lg border border-slate-200 bg-white p-4 text-sm"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-slate-900">
                  {entry.hotelName} ·{" "}
                  {query.guestId ? (
                    entry.guestEmail
                  ) : (
                    <Link
                      href={adminFeedbackHref(
                        { ...query, guestId: entry.guestId },
                        1,
                      )}
                      className="underline"
                      title="Show all feedback from this guest"
                    >
                      {entry.guestEmail}
                    </Link>
                  )}
                </span>
                <time
                  className="text-xs text-slate-500"
                  dateTime={entry.createdAt.toISOString()}
                >
                  {entry.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </time>
              </div>
              <p className="text-xs text-slate-600">
                Plan day {entry.dayNumber}, started{" "}
                {DAY_MONTH_YEAR.format(entry.dayStartedAt)}
              </p>
              {entry.topic ? (
                <div className="mt-3">
                  <p className="inline-block rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800">
                    {TOPIC_LABELS[entry.topic]}
                  </p>
                  <p className="mt-2 whitespace-pre-wrap break-words text-slate-900">
                    {entry.comment}
                  </p>
                </div>
              ) : (
                <dl className="mt-3 space-y-2">
                  <p className="text-xs text-slate-500">
                    Earlier form (ratings)
                  </p>
                  {FEEDBACK_SEGMENTS.map((segment) => {
                    const answer = entry.segments[segment];
                    return (
                      <div key={segment}>
                        <dt className="text-xs font-medium text-slate-700">
                          {SEGMENT_LABELS[segment]}
                        </dt>
                        <dd className="text-slate-900">
                          {answer.rating === null ? (
                            <span className="text-slate-500">
                              Didn&apos;t use it
                            </span>
                          ) : (
                            `${answer.rating} / 5`
                          )}
                          {answer.note ? (
                            <p className="mt-1 whitespace-pre-wrap break-words text-slate-700">
                              {answer.note}
                            </p>
                          ) : null}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <nav aria-label="Pages" className="flex items-center gap-3 text-sm">
          {query.page > 1 ? (
            <Link
              href={adminFeedbackHref(query, query.page - 1)}
              className="inline-flex min-h-10 items-center rounded border border-slate-300 px-3"
            >
              Newer
            </Link>
          ) : null}
          <span className="text-slate-600">
            Page {Math.min(query.page, pages)} of {pages}
          </span>
          {query.page < pages ? (
            <Link
              href={adminFeedbackHref(query, query.page + 1)}
              className="inline-flex min-h-10 items-center rounded border border-slate-300 px-3"
            >
              Older
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
