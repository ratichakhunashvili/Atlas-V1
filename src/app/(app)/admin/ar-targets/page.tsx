import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { listArTargetsForAdmin } from "@/db/queries/place-ar-targets";
import { listPlaces } from "@/db/queries/places";
import { deleteArTargetAction } from "@/features/ar-targets/actions";
import { ArTargetForm } from "./ar-target-form";

/**
 * Camera references for AR check-in.
 *
 * Note what this page does NOT show: the reference fingerprints themselves. The
 * listing query selects every column except the hash, so a browser with this page
 * open is never holding something a guest could submit as a match. The admin sees
 * the fingerprint of an image only at the moment their own browser computes it.
 */
export default async function AdminArTargetsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const [rows, places] = await Promise.all([listArTargetsForAdmin(), listPlaces()]);

  const taken = new Set(rows.map((row) => row.placeId));
  const selectable = places
    .filter((place) => place.category !== "hotel" && place.archivedAt === null)
    .map((place) => ({ id: place.id, name: place.name, hasTarget: taken.has(place.id) }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Camera references</h1>
        <p className="text-sm text-slate-600">
          A guest at one of these Places can confirm their arrival by pointing their camera at it. The match is
          one signal among several — their location still has to agree, and a stop that requires a QR code still
          requires the QR code.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}
      {ok && <Alert variant="success">{ok}</Alert>}

      <Card className="space-y-3">
        <h2 className="font-medium">Add or replace a reference</h2>
        {selectable.length === 0 ? (
          <p className="text-sm text-slate-600">
            There are no published, non-hotel Places to attach a reference to yet.
          </p>
        ) : (
          <ArTargetForm places={selectable} />
        )}
      </Card>

      <Card className="space-y-3">
        <h2 className="font-medium">Existing references</h2>
        {rows.length === 0 ? (
          <EmptyState
            title="No camera references yet"
            description="Add one above and guests at that Place will be offered the camera."
          />
        ) : (
          <ul className="divide-y divide-slate-200">
            {rows.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {row.placeName}
                    {row.placeArchivedAt && <span className="ml-2 text-xs text-amber-700">archived</span>}
                  </p>
                  {row.description && <p className="text-xs text-slate-500">{row.description}</p>}
                  <p className="text-xs text-slate-400">
                    Updated {row.updatedAt.toLocaleDateString("en-GB")}
                  </p>
                </div>
                <form action={deleteArTargetAction}>
                  <input type="hidden" name="id" value={row.id} />
                  <Button type="submit" variant="secondary">
                    Remove
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-slate-500">
          Removing a reference stops future camera check-ins at that Place. Visits already recorded stay in
          guests&apos; history exactly as they are.
        </p>
      </Card>
    </div>
  );
}
