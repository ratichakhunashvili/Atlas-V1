import { listAuditLogWithActors } from "@/db/queries/admin-audit";

export const dynamic = "force-dynamic";

function describeState(state: unknown): string {
  if (state === null || state === undefined) return "—";
  return Object.entries(state as Record<string, unknown>)
    .map(([key, value]) => `${key}: ${value === null ? "none" : String(value)}`)
    .join(", ");
}

/**
 * The append-only record of sensitive admin changes (partnerships, Place publication and archival, QR credentials,
 * model settings, staff roles, support lookups). The database refuses edits and deletes of these rows. Snapshots hold
 * only the fields that changed — never a token, hash, password or private reference.
 */
export default async function AuditLogPage() {
  const events = await listAuditLogWithActors(100);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Audit log</h1>
        <p className="text-sm text-slate-600">The latest {events.length} audited changes, newest first. Times are UTC.</p>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-slate-600">Nothing has been audited yet.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((event) => (
            <li key={event.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-slate-900">{event.action}</span>
                <time className="text-xs text-slate-500" dateTime={event.occurredAt.toISOString()}>
                  {event.occurredAt.toISOString().slice(0, 19).replace("T", " ")}
                </time>
              </div>
              <p className="text-xs text-slate-600">
                by {event.actorEmail ?? "an account that no longer exists"} · {event.targetType} {event.targetId}
              </p>
              {(event.before !== null || event.after !== null) && (
                <p className="mt-1 break-words text-xs text-slate-600">
                  {describeState(event.before)} → {describeState(event.after)}
                </p>
              )}
              {event.reason && <p className="mt-1 text-xs text-slate-500">Reason: {event.reason}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
