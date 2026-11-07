import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { HotelForm } from "@/components/hotel/hotel-form";
import { QrCredentialPanel } from "@/components/qr/qr-credential-panel";
import { Alert } from "@/components/shared/alert";
import { Card } from "@/components/shared/card";
import { findHotelById } from "@/db/queries/hotels";
import { listPlaces } from "@/db/queries/places";
import { findActiveQrCredentialForHotel } from "@/db/queries/qr-credentials";
import { deleteHotelAction, updateHotelAction } from "@/features/hotels/actions";
import {
  issueHotelEntryCredentialAction,
  revokeHotelEntryCredentialAction,
} from "@/features/qr-credentials/actions";
import { uuidOrNotFound } from "@/lib/route-ids";

export const metadata = { title: "Edit hotel" };

export default async function EditHotelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const id = uuidOrNotFound((await params).id);
  const { error, ok } = await searchParams;
  const [hotel, places] = await Promise.all([findHotelById(id), listPlaces()]);

  if (!hotel) {
    notFound();
  }

  // Only whether a live credential exists and when it was issued — never the
  // credential itself, which is stored as a hash and cannot be recovered.
  const entryCredential = await findActiveQrCredentialForHotel(hotel.id);
  // The hotel's own place, plus places that could become it. Other hotels' places are never offered.
  const placeOptions = places.filter(
    (place) => place.id === hotel.placeId || (place.archivedAt === null && place.kind !== "hotel")
  );

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/admin" className="atlas-hit inline-block text-sm text-slate-600 underline">
          ← Hotels
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{hotel.place.name}</h1>
      </div>
      {ok && <Alert variant="success">{ok}</Alert>}
      {error && <Alert>{error}</Alert>}
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href={`/admin/hotels/${hotel.id}/partnerships`} className="atlas-hit text-slate-700 underline">
          Promotion
        </Link>
        <Link href={`/admin/hotels/${hotel.id}/facilities`} className="atlas-hit text-slate-700 underline">
          Hotel facilities
        </Link>
        <Link href={`/admin/hotels/${hotel.id}/events`} className="atlas-hit text-slate-700 underline">
          Hotel events
        </Link>
        <Link href={`/admin/places/${hotel.placeId}`} className="atlas-hit text-slate-700 underline">
          Edit the hotel&apos;s place details
        </Link>
      </p>
      <QrCredentialPanel
        label="Hotel entry QR"
        description="Scanned at the front desk to start a guest's stay. It cannot be used to check in at a Place."
        hasActiveCredential={entryCredential !== null}
        issuedAt={entryCredential?.createdAt ?? null}
        linkPath="/checkin/"
        issue={issueHotelEntryCredentialAction.bind(null, hotel.id)}
        revoke={revokeHotelEntryCredentialAction.bind(null, hotel.id)}
      />
      <Card className="space-y-3">
        <h2 className="font-medium">Hotel&apos;s place</h2>
        <HotelForm
          action={updateHotelAction.bind(null, hotel.id)}
          places={placeOptions.map(({ id, name }) => ({ id, name }))}
          currentPlaceId={hotel.placeId}
        />
      </Card>
      <Card className="space-y-3">
        <h2 className="font-medium">Delete hotel</h2>
        <p className="text-sm text-slate-500">
          Only possible while no guest has stayed here. Its partnerships, facilities, events and hotel code are deleted with it.
        </p>
        <form action={deleteHotelAction}>
          <input type="hidden" name="id" value={hotel.id} />
          <ConfirmSubmit confirm={`Delete ${hotel.place.name}? Its partnerships, facilities, events and hotel code are deleted too. This can't be undone.`}>
            Delete hotel
          </ConfirmSubmit>
        </form>
      </Card>
    </div>
  );
}
