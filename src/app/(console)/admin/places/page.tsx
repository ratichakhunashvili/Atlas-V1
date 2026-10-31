import type { Metadata } from "next";
import { AdminTable, MutedCell, RowAction } from "@/components/admin/data-table";
import { AdminFlash, AdminHeaderAction, AdminNote, AdminPageHeader } from "@/components/admin/page-parts";
import { StatusPill, type AdminStatus } from "@/components/admin/status-pill";
import { listPlaces } from "@/db/queries/places";

/*
 * AdminPlaces · Places — Figma frame 70:978, on real data: every Place Atlas knows about. A Place
 * reaches a guest only through its own hotel's relationship (services/eligibility); this list is
 * the catalog, not a recommendation. "Edit" and "New place" open the existing Place editor and form.
 */

export const metadata: Metadata = { title: "Places" };
export const dynamic = "force-dynamic";

const PRICE_LEVELS: Record<number, string> = { 1: "Budget", 2: "Moderate", 3: "Luxury" };

function label(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function placeStatus(place: { archivedAt: Date | null; publicationStatus: string }): AdminStatus {
  if (place.archivedAt) return "Archived";
  return place.publicationStatus === "published" ? "Published" : "Draft";
}

export default async function AdminPlacesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, places] = await Promise.all([searchParams, listPlaces()]);

  return (
    <>
      <AdminPageHeader
        title="Places"
        description="The places Atlas knows about. A hotel only shows one it has a partnership with."
        action={<AdminHeaderAction href="/admin/places/new">New place</AdminHeaderAction>}
      />
      <AdminFlash error={error} />
      {places.length === 0 ? (
        <AdminNote>No places yet.</AdminNote>
      ) : (
        <AdminTable
          caption="Places"
          columns={[
            { label: "Name", width: 230 },
            { label: "Category", width: 140 },
            { label: "Price level", width: 120 },
            { label: "Verified", width: 120 },
            { label: "Status", width: 120 },
            { label: "Actions", hidden: true },
          ]}
          rows={places.map((place) => ({
            key: place.id,
            cells: [
              place.name,
              label(place.category),
              place.priceLevel ? PRICE_LEVELS[place.priceLevel] : <MutedCell>Not set</MutedCell>,
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
