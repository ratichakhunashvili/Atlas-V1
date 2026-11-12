import type { Metadata } from "next";
import { AdminTable, RowAction, RowTitleLink } from "@/components/admin/data-table";
import { AdminFlash, AdminNote, AdminPageHeader } from "@/components/admin/page-parts";
import { StatusPill, type AdminStatus } from "@/components/admin/status-pill";
import { listAllPartnershipsForAdmin } from "@/db/queries/hotel-partnerships";

/*
 * AdminPartnerships · Hotel partners — Figma frame 70:1190, on real data.
 *
 * A VIEW over the canonical model: each row is one hotel_partnerships record (a promotion) joined to the Place
 * it promotes and the hotel that promotes it. Nothing here creates a Place or changes eligibility.
 * Promotions are added, confirmed (with their date window and priority) and suspended or revoked
 * on that hotel's own Promotion page, because a promotion only means anything for one hotel,
 * so "Manage" opens that page, and the design's "Link a place" is replaced by a note saying where
 * to do it.
 */

export const metadata: Metadata = { title: "Promotion" };
export const dynamic = "force-dynamic";

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function partnershipStatus(status: string, endsAt: Date | null, now: Date): AdminStatus {
  if (status === "active" && endsAt && endsAt <= now) return "Expired";
  if (status === "active") return "Active";
  if (status === "suspended") return "Suspended";
  if (status === "revoked") return "Revoked";
  return "Pending";
}

function formatWindow(startsAt: Date | null, endsAt: Date | null) {
  if (!startsAt && !endsAt) return "Open-ended";
  return `${startsAt ? DATE.format(startsAt) : "Now"} – ${endsAt ? DATE.format(endsAt) : "No end"}`;
}

export default async function AdminPartnershipsPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, rows] = await Promise.all([searchParams, listAllPartnershipsForAdmin()]);
  const now = new Date();

  return (
    <>
      <AdminPageHeader
        title="Promotion"
        description="Which Atlas partners each hotel promotes to its own guests (priority, featured, offer). A promotion applies to that hotel only."
      />
      <AdminFlash error={error} />
      {rows.length === 0 ? (
        <AdminNote>No promotions yet.</AdminNote>
      ) : (
        <AdminTable
          caption="Promotion"
          columns={[
            { label: "Hotel", width: 160 },
            { label: "Place", width: 220 },
            { label: "Status", width: 120 },
            { label: "Window", width: 200 },
            { label: "Featured", width: 110 },
            { label: "Updated", width: 130 },
            { label: "Actions", hidden: true },
          ]}
          rows={rows.map(({ partnership, place, hotelId, hotelName }) => ({
            key: partnership.id,
            cells: [
              <RowTitleLink key="hotel" href={`/admin/hotels/${hotelId}/partnerships`}>
                {hotelName}
              </RowTitleLink>,
              <RowTitleLink key="place" href={`/admin/places/${place.id}`}>
                {place.name}
              </RowTitleLink>,
              <StatusPill key="status" status={partnershipStatus(partnership.status, partnership.endsAt, now)} />,
              formatWindow(partnership.startsAt, partnership.endsAt),
              partnership.featured ? (partnership.offerText ? "Yes · offer" : "Yes") : "—",
              DATE.format(partnership.updatedAt),
              <RowAction
                key="edit"
                href={`/admin/hotels/${hotelId}/partnerships`}
                label={`Manage ${hotelName} promotion of ${place.name}`}
              >
                Manage
              </RowAction>,
            ],
          }))}
        />
      )}
      <AdminNote>A promotion only applies while its status is Active, today is inside its window, and the place has an Atlas contract in force. It never decides whether guests see the place.</AdminNote>
      <AdminNote>To add a promotion, open the hotel from Hotels and choose Promotion.</AdminNote>
    </>
  );
}
