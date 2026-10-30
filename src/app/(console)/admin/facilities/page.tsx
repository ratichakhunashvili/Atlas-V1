import type { Metadata } from "next";
import { AdminTable, RowAction } from "@/components/admin/data-table";
import { ADMIN_FACILITIES } from "@/components/admin/fixtures";
import { AdminHeaderAction, AdminPageHeader, SampleDataNote } from "@/components/admin/page-parts";
import { StatusPill } from "@/components/admin/status-pill";

/* AdminFacilities · Facilities — Figma frame 70:1382. */

export const metadata: Metadata = { title: "Admin · Facilities" };

export default function AdminFacilitiesPage() {
  return (
    <>
      <AdminPageHeader
        title="Facilities"
        description={"A hotel's own pool, spa, gym, restaurant or events. No partnership needed."}
        action={<AdminHeaderAction to="AdminFacilityForm">New facility</AdminHeaderAction>}
      />
      <AdminTable
        caption="Facilities"
        columns={[
          { label: "Name", width: 200 },
          { label: "Hotel", width: 130 },
          { label: "Type", width: 130 },
          { label: "Hours", width: 160 },
          { label: "Status", width: 110 },
          { label: "Actions", hidden: true },
        ]}
        rows={ADMIN_FACILITIES.map((facility) => ({
          key: `${facility.hotel}-${facility.name}`,
          cells: [
            facility.name,
            facility.hotel,
            facility.type,
            facility.hours,
            <StatusPill key="status" status={facility.status} />,
            <RowAction key="edit" to="AdminFacilityForm" label={`Edit ${facility.hotel} ${facility.name}`}>
              Edit
            </RowAction>,
          ],
        }))}
      />
      <SampleDataNote />
    </>
  );
}
