import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";
import { ContractControls, PlaceKindForm } from "@/components/admin/contract-controls";
import { PlaceForm } from "@/components/places/place-form";
import { QrCredentialPanel } from "@/components/qr/qr-credential-panel";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { listContractsForPlace } from "@/db/queries/atlas-contracts";
import { findPlaceById } from "@/db/queries/places";
import { findActiveQrCredentialForPlace } from "@/db/queries/qr-credentials";
import { archivePlaceAction, deletePlaceAction, unarchivePlaceAction, updatePlaceAction } from "@/features/places/actions";
import { hasReturnedPlaceForm, placePrefill } from "@/features/places/prefill";
import {
  issuePlaceCheckInCredentialAction,
  revokePlaceCheckInCredentialAction,
} from "@/features/qr-credentials/actions";
import { uuidOrNotFound } from "@/lib/route-ids";

export const metadata = { title: "Edit place" };

export default async function EditPlacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const id = uuidOrNotFound((await params).id);
  const query = await searchParams;
  const place = await findPlaceById(id);

  if (!place) {
    notFound();
  }

  // Presence only — the credential is stored as a hash and is never recoverable.
  const [checkInCredential, contracts] = await Promise.all([findActiveQrCredentialForPlace(place.id), listContractsForPlace(place.id)]);
  const returnTo = `/admin/places/${place.id}`;
  // After a refused save, show what the admin typed rather than the saved row.
  const typed = Object.fromEntries(Object.entries(placePrefill(query)).filter(([, value]) => value !== undefined));
  const formValues = query.error && hasReturnedPlaceForm(query) ? { ...place, ...typed } : place;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link href="/admin/places" className="atlas-hit inline-block text-sm text-slate-600 underline">
          ← Places
        </Link>
        <h1 className="mt-2 text-xl font-semibold">{place.name}</h1>
        {place.archivedAt && <p className="text-sm text-slate-500">Archived: guests don&apos;t see this place.</p>}
      </div>
      {query.ok && <Alert variant="success">{query.ok}</Alert>}
      {query.error && <Alert>{query.error}</Alert>}
      <Card className="space-y-3">
        <h2 className="font-medium">Atlas catalogue</h2>
        <p className="text-sm text-slate-500">Not live for guests yet: this starts deciding what guests see in the next phase.</p>
        <PlaceKindForm placeId={place.id} kind={place.kind} confirmed={place.kindConfirmedAt !== null} returnTo={returnTo} />
        {place.kind === "business" || contracts.length > 0 ? (
          <ContractControls placeId={place.id} placeName={place.name} kind={place.kind} contracts={contracts} now={new Date()} returnTo={returnTo} />
        ) : null}
      </Card>
      <QrCredentialPanel
        label="Place check-in QR"
        description="Displayed at this Place for guests to scan on arrival. It cannot be used to start a hotel stay."
        linkPath="/unlock/"
        hasActiveCredential={checkInCredential !== null}
        issuedAt={checkInCredential?.createdAt ?? null}
        issue={issuePlaceCheckInCredentialAction.bind(null, place.id)}
        revoke={revokePlaceCheckInCredentialAction.bind(null, place.id)}
      />
      <Card className="space-y-3">
        <h2 className="font-medium">Details</h2>
        <PlaceForm action={updatePlaceAction.bind(null, place.id)} place={formValues} />
      </Card>
      <Card className="space-y-3">
        <h2 className="font-medium">Archive or delete</h2>
        <p className="text-sm text-slate-500">
          Archiving hides the place from guests and keeps its history. Deleting is only possible for a place with no history at all.
        </p>
        <div className="flex flex-wrap gap-2">
          {place.archivedAt ? (
            <form action={unarchivePlaceAction}>
              <input type="hidden" name="id" value={place.id} />
              <Button variant="secondary" type="submit">
                Unarchive
              </Button>
            </form>
          ) : (
            <form action={archivePlaceAction}>
              <input type="hidden" name="id" value={place.id} />
              <ConfirmSubmit variant="secondary" confirm={`Archive ${place.name}? Guests stop seeing it, and it goes back to draft.`}>
                Archive
              </ConfirmSubmit>
            </form>
          )}
          <form action={deletePlaceAction}>
            <input type="hidden" name="id" value={place.id} />
            <ConfirmSubmit confirm={`Delete ${place.name} for good? This can't be undone.`}>Delete</ConfirmSubmit>
          </form>
        </div>
      </Card>
    </div>
  );
}
