import type { Metadata } from "next";
import { AdminTable, RowAction } from "@/components/admin/data-table";
import { ADMIN_PARTNERSHIPS } from "@/components/admin/fixtures";
import { AdminHeaderAction, AdminNote, AdminPageHeader, SampleDataNote } from "@/components/admin/page-parts";
import { StatusPill } from "@/components/admin/status-pill";

/* AdminPartnerships · Hotel partners — Figma frame 70:1190. */

export const metadata: Metadata = { title: "Admin · Hotel partners" };

export default function AdminPartnershipsPage() {
  return (
    <>
      <AdminPageHeader
        title="Hotel partners"
        description="Which places each hotel has approved. A partnership applies to that hotel only."
        action={<AdminHeaderAction to="AdminPartnershipForm">Link a place</AdminHeaderAction>}
      />
      <AdminTable
        caption="Hotel partners"
        columns={[
          { label: "Hotel", width: 140 },
          { label: "Place", width: 220 },
          { label: "Status", width: 110 },
          { label: "Window", width: 200 },
          { label: "Updated", width: 130 },
          { label: "Actions", hidden: true },
        ]}
        rows={ADMIN_PARTNERSHIPS.map((partnership) => ({
          key: `${partnership.hotel}-${partnership.place}`,
          cells: [
            partnership.hotel,
            partnership.place,
            <StatusPill key="status" status={partnership.status} />,
            partnership.window,
            partnership.updated,
            <RowAction
              key="edit"
              to="AdminPartnershipForm"
              label={`Edit ${partnership.hotel} partnership with ${partnership.place}`}
            >
              Edit
            </RowAction>,
          ],
        }))}
      />
      <AdminNote>Guests only see a partner place while its status is Active and today is inside its window.</AdminNote>
      <SampleDataNote />
    </>
  );
}
