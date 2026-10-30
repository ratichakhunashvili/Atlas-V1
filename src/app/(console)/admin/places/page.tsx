import type { Metadata } from "next";
import { AdminTable, MutedCell, RowAction } from "@/components/admin/data-table";
import { ADMIN_PLACES } from "@/components/admin/fixtures";
import { AdminHeaderAction, AdminPageHeader, SampleDataNote } from "@/components/admin/page-parts";
import { StatusPill } from "@/components/admin/status-pill";

/* AdminPlaces · Places — Figma frame 70:978. */

export const metadata: Metadata = { title: "Admin · Places" };

export default function AdminPlacesPage() {
  return (
    <>
      <AdminPageHeader
        title="Places"
        description="The places Atlas knows about. A hotel only shows one it has a partnership with."
        action={<AdminHeaderAction to="AdminPlaceForm">New place</AdminHeaderAction>}
      />
      <AdminTable
        caption="Places"
        columns={[
          { label: "Name", width: 230 },
          { label: "Category", width: 130 },
          { label: "Price level", width: 120 },
          { label: "Verified", width: 120 },
          { label: "Status", width: 120 },
          { label: "Actions", hidden: true },
        ]}
        rows={ADMIN_PLACES.map((place) => ({
          key: place.name,
          cells: [
            place.name,
            place.category,
            place.priceLevel ?? <MutedCell>Not set</MutedCell>,
            place.verified ? <StatusPill status="Verified" /> : <MutedCell>Not verified</MutedCell>,
            <StatusPill key="status" status={place.status} />,
            <RowAction key="edit" to="AdminPlaceForm" label={`Edit ${place.name}`}>
              Edit
            </RowAction>,
          ],
        }))}
      />
      <SampleDataNote />
    </>
  );
}
