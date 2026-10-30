import type { Metadata } from "next";
import { AdminTable, RowAction } from "@/components/admin/data-table";
import { ADMIN_HOTELS } from "@/components/admin/fixtures";
import { AdminHeaderAction, AdminPageHeader, SampleDataNote } from "@/components/admin/page-parts";
import { StatusPill } from "@/components/admin/status-pill";

/* AdminHotels · Hotels — Figma frame 70:811. The admin home. */

export const metadata: Metadata = { title: "Admin · Hotels" };

export default function AdminHotelsPage() {
  return (
    <>
      <AdminPageHeader
        title="Hotels"
        description="Hotels that guests can join with a hotel code."
        action={<AdminHeaderAction to="AdminHotelForm">New hotel</AdminHeaderAction>}
      />
      <AdminTable
        caption="Hotels"
        columns={[
          { label: "Name", width: 260 },
          { label: "City", width: 160 },
          { label: "Facilities", width: 120 },
          { label: "Active partners", width: 160 },
          { label: "Status", width: 120 },
          { label: "Actions", hidden: true },
        ]}
        rows={ADMIN_HOTELS.map((hotel) => ({
          key: hotel.name,
          cells: [
            hotel.name,
            hotel.city,
            hotel.facilities,
            hotel.activePartners,
            <StatusPill key="status" status={hotel.status} />,
            <RowAction key="edit" to="AdminHotelForm" label={`Edit ${hotel.name}`}>
              Edit
            </RowAction>,
          ],
        }))}
      />
      <SampleDataNote />
    </>
  );
}
