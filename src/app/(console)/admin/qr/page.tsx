import type { Metadata } from "next";
import { AdminTable, MutedCell, RowAction, RowTitleLink } from "@/components/admin/data-table";
import { AdminNote, AdminPageHeader } from "@/components/admin/page-parts";
import { StatusPill } from "@/components/admin/status-pill";
import { listHotelsWithPlace } from "@/db/queries/hotels";
import { listActiveQrCredentialsForAdmin } from "@/db/queries/qr-credentials";
import { DAY_MONTH_YEAR as DATE } from "@/lib/format";

/*
 * QR codes in use, on real data. Only a hash of each code is stored, so a code is never shown again after
 * it is issued: issuing, replacing and revoking happen on the hotel's or the place's own page, where the
 * new code is shown once. "Manage" opens that page.
 */

export const metadata: Metadata = { title: "QR codes" };
export const dynamic = "force-dynamic";


export default async function AdminQrPage() {
  const [codes, hotels] = await Promise.all([listActiveQrCredentialsForAdmin(), listHotelsWithPlace()]);
  const hotelsWithoutCode = hotels.filter((hotel) => hotel.entryCredentialIssuedAt === null);

  return (
    <>
      <AdminPageHeader
        title="QR codes"
        description="Codes in use: a hotel code starts a guest's stay, a check-in code confirms a visit to a place. Each works for its own purpose only."
      />
      {hotelsWithoutCode.length > 0 && (
        <AdminNote>
          {`No hotel code yet: ${hotelsWithoutCode.map((hotel) => hotel.place.name).join(", ")}. Guests of ${
            hotelsWithoutCode.length === 1 ? "this hotel" : "these hotels"
          } can't start a stay by scanning.`}
        </AdminNote>
      )}
      {codes.length === 0 ? (
        <AdminNote>No codes in use.</AdminNote>
      ) : (
        <AdminTable
          caption="QR codes in use"
          columns={[
            { label: "For", width: 240 },
            { label: "Purpose", width: 150 },
            { label: "Issued", width: 140 },
            { label: "Expires", width: 140 },
            { label: "Actions", hidden: true },
          ]}
          rows={codes.map((code) => {
            const isHotel = code.purpose === "hotel_entry";
            const name = (isHotel ? code.hotelName : code.placeName) ?? "Unknown";
            const href = isHotel ? `/admin/hotels/${code.hotelId}` : `/admin/places/${code.placeId}`;
            return {
              key: code.id,
              cells: [
                <RowTitleLink key="name" href={href}>
                  {name}
                </RowTitleLink>,
                <StatusPill key="purpose" status={isHotel ? "Hotel entry" : "Place check-in"} />,
                DATE.format(code.createdAt),
                code.expiresAt ? DATE.format(code.expiresAt) : <MutedCell>No expiry</MutedCell>,
                <RowAction key="manage" href={href} label={`Manage the code for ${name}`}>
                  Manage
                </RowAction>,
              ],
            };
          })}
        />
      )}
      <AdminNote>
        To issue, replace or revoke a code, open the hotel or the place. A new code is shown once there; Atlas keeps only a
        fingerprint of it.
      </AdminNote>
    </>
  );
}
