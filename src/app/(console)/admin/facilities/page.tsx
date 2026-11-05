import type { Metadata } from "next";
import { AdminTable, RowAction, RowTitleLink } from "@/components/admin/data-table";
import { AdminNote, AdminPageHeader } from "@/components/admin/page-parts";
import { StatusPill } from "@/components/admin/status-pill";
import { listAllFacilitiesForAdmin } from "@/db/queries/hotel-facilities";

/*
 * Hotel facilities across every hotel, on real data. A facility belongs to one hotel, so it is added,
 * deactivated and reactivated on that hotel's own facilities page; "Manage" opens it.
 */

export const metadata: Metadata = { title: "Hotel facilities" };
export const dynamic = "force-dynamic";

function sentence(value: string) {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export default async function AdminFacilitiesPage() {
  const rows = await listAllFacilitiesForAdmin();

  return (
    <>
      <AdminPageHeader
        title="Hotel facilities"
        description="What each hotel owns itself: pool, spa, gym, restaurant. Shown to that hotel's guests only, with no partnership needed."
      />
      {rows.length === 0 ? (
        <AdminNote>No facilities yet.</AdminNote>
      ) : (
        <AdminTable
          caption="Hotel facilities"
          columns={[
            { label: "Name", width: 220 },
            { label: "Hotel", width: 200 },
            { label: "Type", width: 140 },
            { label: "Status", width: 120 },
            { label: "Actions", hidden: true },
          ]}
          rows={rows.map(({ facility, place, hotelId, hotelName }) => ({
            key: facility.id,
            cells: [
              <RowTitleLink key="name" href={`/admin/places/${place.id}`}>
                {place.name}
              </RowTitleLink>,
              hotelName,
              sentence(facility.facilityType),
              <StatusPill key="status" status={place.archivedAt ? "Archived" : facility.status === "active" ? "Active" : "Inactive"} />,
              <RowAction key="manage" href={`/admin/hotels/${hotelId}/facilities`} label={`Manage ${hotelName} facilities`}>
                Manage
              </RowAction>,
            ],
          }))}
        />
      )}
      <AdminNote>To add a facility, open the hotel from Hotels and choose Hotel facilities.</AdminNote>
    </>
  );
}
