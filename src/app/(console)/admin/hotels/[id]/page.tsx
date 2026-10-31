import Link from "next/link";
import { notFound } from "next/navigation";
import { HotelForm } from "@/components/hotel/hotel-form";
import { QrCredentialPanel } from "@/components/qr/qr-credential-panel";
import { findHotelById } from "@/db/queries/hotels";
import { listPlaces } from "@/db/queries/places";
import { findActiveQrCredentialForHotel } from "@/db/queries/qr-credentials";
import { updateHotelAction } from "@/features/hotels/actions";
import {
  issueHotelEntryCredentialAction,
  revokeHotelEntryCredentialAction,
} from "@/features/qr-credentials/actions";

export default async function EditHotelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const [hotel, places] = await Promise.all([findHotelById(id), listPlaces()]);

  if (!hotel) {
    notFound();
  }

  // Only whether a live credential exists and when it was issued — never the
  // credential itself, which is stored as a hash and cannot be recovered.
  const entryCredential = await findActiveQrCredentialForHotel(hotel.id);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">Edit hotel</h1>
      <p className="flex gap-4 text-sm">
        <Link href={`/admin/hotels/${hotel.id}/partnerships`} className="text-slate-700 underline">
          Manage external partners
        </Link>
        <Link href={`/admin/hotels/${hotel.id}/facilities`} className="text-slate-700 underline">
          Manage hotel-owned facilities
        </Link>
        <Link href={`/admin/hotels/${hotel.id}/events`} className="text-slate-700 underline">
          Manage hotel events
        </Link>
      </p>
      <QrCredentialPanel
        label="Hotel entry QR"
        description="Scanned at the front desk to start a guest's stay. It cannot be used to check in at a Place."
        hasActiveCredential={entryCredential !== null}
        issuedAt={entryCredential?.createdAt ?? null}
        issue={issueHotelEntryCredentialAction.bind(null, hotel.id)}
        revoke={revokeHotelEntryCredentialAction.bind(null, hotel.id)}
      />
      <HotelForm
        action={updateHotelAction.bind(null, hotel.id)}
        places={places.map(({ id, name }) => ({ id, name }))}
        currentPlaceId={hotel.placeId}
        error={error}
      />
    </div>
  );
}
