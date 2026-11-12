import Link from "next/link";
import { Alert } from "@/components/shared/alert";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { buttonStyles } from "@/components/shared/button";
import type { Metadata } from "next";
import { listGuestReachForAdmin, type CatalogueExclusionReason, type EligibilitySource, type GuestReachRow } from "@/services/eligibility";

/**
 * Guest reach: every Place a guest might visit, and whether guests can see it today.
 *
 * The verdict is the guest catalogue's own: listGuestReachForAdmin runs the same eligibility service the guest screens
 * use, once per hotel, so this screen cannot disagree with what guests are shown (docs/catalogue-model-plan.md):
 * attractions need no contract, a business needs an active, confirmed, in-window Atlas contract, and a hotel facility
 * is seen only by its own hotel's guests; every Place must be published, verified and not archived. A hotel promotion
 * is listed separately because it changes ranking and labels only, never visibility.
 */
export const metadata: Metadata = { title: "Guest reach" };

function sentence(value: string) {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const REASON_TEXT: Record<CatalogueExclusionReason, string> = {
  archived: "Archived",
  unpublished: "Not published",
  unverified: "Not verified",
  no_contract: "No Atlas contract",
  contract_pending_review: "Atlas contract is pending review",
  contract_suspended: "Atlas contract is suspended",
  contract_ended: "Atlas contract has ended",
  contract_unconfirmed: "Atlas contract is not confirmed",
  contract_not_started: "Atlas contract has not started yet",
  contract_expired: "Atlas contract has expired",
  facility_inactive: "Hotel facility is inactive",
};

const SOURCE_TEXT: Record<EligibilitySource, string> = {
  attraction: "Attraction",
  partner: "Atlas partner",
  facility: "Hotel facility",
};

function names(hotels: { name: string }[]) {
  return hotels.map((hotel) => hotel.name).join(", ");
}

function Reach({ row }: { row: GuestReachRow }) {
  if (row.visibleAtHotels.length === 0) {
    const reasons = row.hiddenReasons.length ? row.hiddenReasons.map((reason) => REASON_TEXT[reason]).join(" · ") : "Not in the guest catalogue";
    return (
      <p className="text-xs text-amber-700">
        <span className="font-medium">Not visible to guests.</span> {reasons}.
      </p>
    );
  }
  const how = row.sources.map((source) => SOURCE_TEXT[source]).join(", ");
  return (
    <p className="text-xs text-green-800">
      <span className="font-medium">{row.visibleEverywhere ? "Visible to guests of every hotel" : `Visible only to guests of ${names(row.visibleAtHotels)}`}</span>
      {` · ${how}`}
    </p>
  );
}

export default async function AdminAttractionsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const rows = await listGuestReachForAdmin();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Guest reach</h1>
          <p className="text-sm text-slate-600">
            Which places guests can see today, worked out exactly as the guest app does. Attractions need no contract; a
            business needs an active, confirmed Atlas contract; a hotel facility is seen only by that hotel&apos;s guests.
            Every place must also be published, verified and not archived. A hotel promotion only changes ranking and the
            &ldquo;Recommended by&rdquo; label.
          </p>
        </div>
        <Link href="/admin/places/new" className={buttonStyles.primary}>
          New place
        </Link>
      </div>

      {error && <Alert>{error}</Alert>}

      {rows.length === 0 ? (
        <EmptyState
          title="No experiences yet"
          description="Create a place, publish and verify it, then mark it as an attraction, give a business an Atlas contract, or add it to a hotel as a facility."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const { place } = row;
            return (
              <li key={place.id}>
                <Card className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="font-medium text-slate-900">{place.name}</h2>
                      <p className="text-xs text-slate-500">
                        {sentence(place.category)} · {sentence(place.kind)}
                        {place.visitDurationMinutes ? ` · about ${place.visitDurationMinutes} min` : " · visit time estimated"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-1">
                      <Badge tone={place.publicationStatus === "published" ? "good" : "muted"}>{sentence(place.publicationStatus)}</Badge>
                      <Badge tone={place.verificationStatus === "verified" ? "good" : "muted"}>{sentence(place.verificationStatus)}</Badge>
                      {place.archivedAt && <Badge tone="muted">Archived</Badge>}
                    </div>
                  </div>

                  <Reach row={row} />
                  <p className="text-xs text-slate-600">
                    {row.promotedBy.length > 0
                      ? `Promoted by ${row.promotedBy.map((hotel) => (hotel.featured ? `${hotel.name} (featured)` : hotel.name)).join(", ")}`
                      : "No hotel promotion"}
                  </p>

                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/admin/places/${place.id}`} className="atlas-hit inline-block text-sm text-slate-700 underline">
                      Edit, archive or delete
                    </Link>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Badge({ tone, children }: { tone: "good" | "muted"; children: React.ReactNode }) {
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs ${
        tone === "good" ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-700"
      }`}
    >
      {children}
    </span>
  );
}
