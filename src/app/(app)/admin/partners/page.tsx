import Link from "next/link";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { listAllPartnershipsForAdmin } from "@/db/queries/hotel-partnerships";
import {
  reopenPartnershipAction,
  revokePartnershipAction,
  suspendPartnershipAction,
} from "@/features/partnerships/actions";

/**
 * Every hotel-to-partner relationship, in one place.
 *
 * A VIEW over the canonical model, not a second copy of it: each row is one
 * `hotel_partnerships` record joined to the Place it approves and the hotel that
 * approved it. Nothing here creates a Place — partners are added from their own
 * hotel's page, because a partnership only means anything in the context of one
 * hotel.
 *
 * It changes no eligibility rule. A guest still sees only their own hotel's
 * active, confirmed, in-window partners; this screen exists so an admin can
 * answer "where does this partner stand?" without opening every hotel in turn.
 *
 * Confirming a partnership is deliberately absent here. Confirmation needs the
 * date window and priority that belong to a single hotel's relationship, and is
 * done on that hotel's own partnerships page.
 */
export default async function AdminPartnersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const rows = await listAllPartnershipsForAdmin();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Partners</h1>
        <p className="text-sm text-slate-600">
          External Places and the hotels that have approved them. A partnership with one hotel never applies to
          another — each row is its own explicit relationship.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}

      {rows.length === 0 ? (
        <EmptyState
          title="No partnerships yet"
          description="Partners are proposed from a hotel's own page, then confirmed there with their date window and priority."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map(({ partnership, place, hotelId, hotelName }) => (
            <li key={partnership.id}>
              <Card className="space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="font-medium text-slate-900">{place.name}</h2>
                    <p className="text-xs text-slate-500">
                      approved by{" "}
                      <Link href={`/admin/hotels/${hotelId}/partnerships`} className="underline">
                        {hotelName}
                      </Link>{" "}
                      · {place.category}
                    </p>
                  </div>
                  <StatusBadge status={partnership.status} />
                </div>

                <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                  <Detail label="Window">{formatWindow(partnership.startsAt, partnership.endsAt)}</Detail>
                  <Detail label="Priority">{partnership.priority ?? "none"}</Detail>
                  <Detail label="Place state">
                    {place.archivedAt
                      ? "archived"
                      : `${place.publicationStatus} · ${place.verificationStatus}`}
                  </Detail>
                </dl>

                {/*
                  Lifecycle actions that need no per-hotel context. Each re-checks
                  admin authorization and the partnership's own id on the server;
                  the buttons only choose which action to call.
                */}
                <div className="flex flex-wrap gap-2">
                  {partnership.status === "active" && (
                    <form action={suspendPartnershipAction.bind(null, partnership.id)}>
                      <Button type="submit" variant="secondary">
                        Suspend
                      </Button>
                    </form>
                  )}
                  {partnership.status === "suspended" && (
                    <form action={reopenPartnershipAction.bind(null, partnership.id)}>
                      <Button type="submit" variant="secondary">
                        Reopen for review
                      </Button>
                    </form>
                  )}
                  {partnership.status !== "revoked" && (
                    <form action={revokePartnershipAction.bind(null, partnership.id)}>
                      <Button type="submit" variant="secondary">
                        Revoke
                      </Button>
                    </form>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "active"
      ? "bg-green-100 text-green-800"
      : status === "pending_review"
        ? "bg-amber-100 text-amber-900"
        : "bg-slate-100 text-slate-700";

  return <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${tone}`}>{status.replace("_", " ")}</span>;
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-1">
      <dt className="text-slate-500">{label}:</dt>
      <dd>{children}</dd>
    </div>
  );
}

function formatWindow(startsAt: Date | null, endsAt: Date | null): string {
  if (!startsAt && !endsAt) return "always";
  const from = startsAt ? startsAt.toISOString().slice(0, 10) : "—";
  const to = endsAt ? endsAt.toISOString().slice(0, 10) : "—";
  return `${from} → ${to}`;
}
