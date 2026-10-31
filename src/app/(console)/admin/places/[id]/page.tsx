import { notFound } from "next/navigation";
import { PlaceForm } from "@/components/places/place-form";
import { QrCredentialPanel } from "@/components/qr/qr-credential-panel";
import { findPlaceById } from "@/db/queries/places";
import { findActiveQrCredentialForPlace } from "@/db/queries/qr-credentials";
import { updatePlaceAction } from "@/features/places/actions";
import {
  issuePlaceCheckInCredentialAction,
  revokePlaceCheckInCredentialAction,
} from "@/features/qr-credentials/actions";

export default async function EditPlacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const place = await findPlaceById(id);

  if (!place) {
    notFound();
  }

  // Presence only — the credential is stored as a hash and is never recoverable.
  const checkInCredential = await findActiveQrCredentialForPlace(place.id);

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-xl font-semibold">Edit place</h1>
      <QrCredentialPanel
        label="Place check-in QR"
        description="Displayed at this Place for guests to scan on arrival. It cannot be used to start a hotel stay."
        hasActiveCredential={checkInCredential !== null}
        issuedAt={checkInCredential?.createdAt ?? null}
        issue={issuePlaceCheckInCredentialAction.bind(null, place.id)}
        revoke={revokePlaceCheckInCredentialAction.bind(null, place.id)}
      />
      <PlaceForm action={updatePlaceAction.bind(null, place.id)} place={place} error={error} />
    </div>
  );
}
