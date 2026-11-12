import type { Metadata } from "next";
import { AdminTable, MutedCell, RowAction, RowTitleLink } from "@/components/admin/data-table";
import { AdminFlash, AdminHeaderAction, AdminNote, AdminPageHeader } from "@/components/admin/page-parts";
import { StatusPill, type AdminStatus } from "@/components/admin/status-pill";
import { listPlaces } from "@/db/queries/places";
import { categoryLabel } from "@/lib/format";
import { describePriceLevel } from "@/services/advisor/preference-ranking";

/*
 * AdminPlaces · Places — Figma frame 70:978, on real data: every Place Atlas knows about. A Place
 * reaches a guest only through its own hotel's relationship (services/eligibility); this list is
 * the catalog, not a recommendation. "Edit" and "New place" open the existing Place editor and form.
 */

export const metadata: Metadata = { title: "Places" };
export const dynamic = "force-dynamic";

function placeStatus(place: { archivedAt: Date | null; publicationStatus: string }): AdminStatus {
  if (place.archivedAt) return "Archived";
  return place.publicationStatus === "published" ? "Published" : "Draft";
}

const KIND_LABEL = { business: "Business", attraction: "Attraction", hotel: "Hotel" } as const;

export default async function AdminPlacesPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const [{ error, ok }, places] = await Promise.all([searchParams, listPlaces()]);

  return (
    <>
      <AdminPageHeader
        title="Places"
        description="Every place Atlas knows about. Guests see a place only when it is published, verified and not archived, and it is an attraction, a business with an active Atlas contract, or their own hotel's facility. Hotel promotion only highlights; it never makes a place visible."
        action={<AdminHeaderAction href="/admin/places/new">New place</AdminHeaderAction>}
      />
      <AdminFlash ok={ok} error={error} />
      {places.length === 0 ? (
        <AdminNote>No places yet.</AdminNote>
      ) : (
        <AdminTable
          caption="Places"
          columns={[
            { label: "Name", width: 230 },
            { label: "Kind", width: 110 },
            { label: "Category", width: 140 },
            { label: "Price level", width: 120 },
            { label: "Verified", width: 120 },
            { label: "Status", width: 120 },
            { label: "Actions", hidden: true },
          ]}
          rows={places.map((place) => ({
            key: place.id,
            cells: [
              <RowTitleLink key="name" href={`/admin/places/${place.id}`}>
                {place.name}
              </RowTitleLink>,
              place.kindConfirmedAt ? KIND_LABEL[place.kind] : <MutedCell>{KIND_LABEL[place.kind]}?</MutedCell>,
              categoryLabel(place.category),
              describePriceLevel(place.priceLevel) ?? <MutedCell>Not set</MutedCell>,
              place.verificationStatus === "verified" ? <StatusPill status="Verified" /> : <MutedCell>Not verified</MutedCell>,
              <StatusPill key="status" status={placeStatus(place)} />,
              <RowAction key="edit" href={`/admin/places/${place.id}`} label={`Edit ${place.name}`}>
                Edit
              </RowAction>,
            ],
          }))}
        />
      )}
    </>
  );
}
