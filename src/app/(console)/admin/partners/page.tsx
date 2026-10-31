import type { Metadata } from "next";
import { AdminTable, RowAction } from "@/components/admin/data-table";
import { AdminFlash, AdminNote, AdminPageHeader } from "@/components/admin/page-parts";
import { StatusPill, type AdminStatus } from "@/components/admin/status-pill";
import { listAllPartnershipsForAdmin } from "@/db/queries/hotel-partnerships";

/*
 * AdminPartnerships · Hotel partners — Figma frame 70:1190, on real data.
 *
 * A VIEW over the canonical model: each row is one hotel_partnerships record joined to the Place
 * it approves and the hotel that approved it. Nothing here creates a Place or changes eligibility.
 * Partners are linked, confirmed (with their date window and priority) and suspended or revoked
 * on that hotel's own partnerships page, because a partnership only means anything for one hotel —
 * so "Edit" opens that page, and the design's "Link a place" is replaced by a note saying where
 * to do it.
 */

export const metadata: Metadata = { title: "Hotel partners" };
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
        title="Hotel partners"
        description="Which places each hotel has approved. A partnership applies to that hotel only."
      />
      <AdminFlash error={error} />
      {rows.length === 0 ? (
        <AdminNote>No partnerships yet.</AdminNote>
      ) : (
        <AdminTable
          caption="Hotel partners"
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
              hotelName,
              place.name,
              <StatusPill key="status" status={partnershipStatus(partnership.status, partnership.endsAt, now)} />,
              formatWindow(partnership.startsAt, partnership.endsAt),
              partnership.featured ? (partnership.offerText ? "Yes · offer" : "Yes") : "—",
              DATE.format(partnership.updatedAt),
              <RowAction
                key="edit"
                href={`/admin/hotels/${hotelId}/partnerships`}
                label={`Edit ${hotelName} partnership with ${place.name}`}
              >
                Edit
              </RowAction>,
            ],
          }))}
        />
      )}
      <AdminNote>Guests only see a partner place while its status is Active and today is inside its window.</AdminNote>
      <AdminNote>To link a place, open the hotel from Hotels and use its partners page.</AdminNote>
    </>
  );
}
