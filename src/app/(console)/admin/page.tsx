import type { Metadata } from "next";
import { AdminTable, MutedCell, RowAction } from "@/components/admin/data-table";
import { AdminHeaderAction, AdminNote, AdminPageHeader } from "@/components/admin/page-parts";
import { StatusPill, type AdminStatus } from "@/components/admin/status-pill";
import { listHotelsForAdminOverview } from "@/db/queries/hotels";

/*
 * AdminHotels · Hotels — Figma frame 70:811, the admin home, on real data. The layout has already
 * required the admin role. "Edit" and "New hotel" open the existing hotel editor and creation form.
 *
 * The design's City column shows the hotel's address: Atlas stores an address, not a city field.
 */

export const metadata: Metadata = { title: "Hotels" };
export const dynamic = "force-dynamic";

function hotelStatus(row: { archivedAt: Date | null; publicationStatus: string }): AdminStatus {
  if (row.archivedAt) return "Archived";
  return row.publicationStatus === "published" ? "Active" : "Inactive";
}

export default async function AdminHotelsPage() {
  const hotels = await listHotelsForAdminOverview(new Date());

  return (
    <>
      <AdminPageHeader
        title="Hotels"
        description="Hotels that guests can join with a hotel code."
        action={<AdminHeaderAction href="/admin/hotels/new">New hotel</AdminHeaderAction>}
      />
      {hotels.length === 0 ? (
        <AdminNote>No hotels yet. Create one to start adding facilities, partners and a hotel code.</AdminNote>
      ) : (
        <AdminTable
          caption="Hotels"
          columns={[
            { label: "Name", width: 260 },
            { label: "Address", width: 200 },
            { label: "Facilities", width: 110 },
            { label: "Active partners", width: 150 },
            { label: "Status", width: 110 },
            { label: "Actions", hidden: true },
          ]}
          rows={hotels.map((hotel) => ({
            key: hotel.id,
            cells: [
              hotel.name,
              hotel.address ?? <MutedCell>Not set</MutedCell>,
              hotel.facilities,
              hotel.activePartners,
              <StatusPill key="status" status={hotelStatus(hotel)} />,
              <RowAction key="edit" href={`/admin/hotels/${hotel.id}`} label={`Edit ${hotel.name}`}>
                Edit
              </RowAction>,
            ],
          }))}
        />
      )}
      <AdminNote>Active partners counts partnerships that are active today. A partner also has to be published and verified before a guest sees it.</AdminNote>
    </>
  );
}
