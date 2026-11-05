import type { Metadata } from "next";
import Link from "next/link";
import { ContractControls, PlaceKindForm } from "@/components/admin/contract-controls";
import { AdminFlash, AdminNote, AdminPageHeader } from "@/components/admin/page-parts";
import { Card } from "@/components/shared/card";
import { listCatalogueForAdmin } from "@/db/queries/atlas-contracts";

/*
 * Atlas contracts and Place kinds (docs/catalogue-model-plan.md, phase C1). Admin-only: the console layout runs
 * requireAdmin() and every action checks it again.
 *
 * Phase C1 changes no guest behaviour. Guests still see only their hotel's facilities and confirmed hotel partners;
 * contracts and kinds start deciding visibility in phase C2.
 */

function categoryLabel(category: string) {
  return category.charAt(0).toUpperCase() + category.slice(1).replaceAll("_", " ");
}

export const metadata: Metadata = { title: "Atlas contracts" };
export const dynamic = "force-dynamic";

export default async function AdminContractsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const [{ error, ok }, rows] = await Promise.all([searchParams, listCatalogueForAdmin()]);
  const now = new Date();
  const live = rows.filter((row) => row.place.archivedAt === null);
  const unconfirmed = live.filter((row) => row.place.kindConfirmedAt === null);
  const businesses = live.filter((row) => row.place.kind === "business");
  const attractions = live.filter((row) => row.place.kind === "attraction");

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Atlas contracts"
        description="Which places are Atlas partners. A business needs an active contract; an attraction needs none."
      />
      <AdminFlash ok={ok} error={error} />
      <AdminNote>
        Not live for guests yet. Contracts and kinds start deciding what guests see in the next phase. Today guests still see
        only their hotel&apos;s facilities and the partners that hotel confirmed.
      </AdminNote>

      {unconfirmed.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-medium">Kinds to confirm ({unconfirmed.length})</h2>
          <p className="text-sm text-slate-500">These kinds were suggested from the category. Check each one and confirm it.</p>
          {unconfirmed.map(({ place }) => (
            <Card key={place.id} className="space-y-2">
              <p className="font-medium text-slate-900">
                <Link href={`/admin/places/${place.id}`} className="underline">
                  {place.name}
                </Link>{" "}
                <span className="text-xs font-normal text-slate-500">({categoryLabel(place.category)})</span>
              </p>
              <PlaceKindForm placeId={place.id} kind={place.kind} confirmed={false} />
            </Card>
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-medium">Businesses ({businesses.length})</h2>
        {businesses.length === 0 ? <p className="text-sm text-slate-500">No businesses yet.</p> : null}
        {businesses.map(({ place, contracts }) => (
          <Card key={place.id} className="space-y-3">
            <p className="font-medium text-slate-900">
              <Link href={`/admin/places/${place.id}`} className="underline">
                {place.name}
              </Link>{" "}
              <span className="text-xs font-normal text-slate-500">({categoryLabel(place.category)})</span>
            </p>
            <ContractControls placeId={place.id} placeName={place.name} kind={place.kind} contracts={contracts} now={now} />
          </Card>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Attractions ({attractions.length})</h2>
        <p className="text-sm text-slate-500">
          {attractions.length === 0 ? "No attractions yet." : attractions.map(({ place }) => place.name).join(" · ")}
        </p>
      </section>
    </div>
  );
}
