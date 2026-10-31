import Link from "next/link";
import { Alert } from "@/components/shared/alert";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { Select } from "@/components/shared/select";
import { listModelsForAdmin } from "@/db/queries/place-models";
import { listPlaces } from "@/db/queries/places";
import { storageService } from "@/services/storage";
import { MAX_MODEL_BYTES } from "@/services/map3d";
import { deletePlaceModelAction, uploadPlaceModelAction } from "@/features/place-models/actions";

/**
 * 3D models attached to Places.
 *
 * If no object store is configured, that is stated up front and the upload form is
 * not offered — an admin should find out before choosing a file, not after.
 */
export default async function AdminModelsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { error, ok } = await searchParams;
  const [rows, places] = await Promise.all([listModelsForAdmin(), listPlaces()]);

  const taken = new Set(rows.map((row) => row.model.placeId));
  const available = places.filter(
    (place) => place.category !== "hotel" && place.archivedAt === null && !taken.has(place.id)
  );

  const maxMegabytes = Math.round(MAX_MODEL_BYTES / (1024 * 1024));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">3D models</h1>
        <p className="text-sm text-slate-600">
          A model stands at its Place on the map. Guests see it in grey until they have actually visited there;
          colour is earned, not given.
        </p>
      </div>

      {error && <Alert>{error}</Alert>}
      {ok && <Alert variant="success">{ok}</Alert>}

      {!storageService.configured && (
        <Alert>
          File storage isn&apos;t configured for this deployment, so models can&apos;t be uploaded yet. An
          administrator needs to connect an object store and set its credentials. Existing models and their settings
          are unaffected.
        </Alert>
      )}

      {storageService.configured && (
        <Card className="space-y-3">
          <h2 className="font-medium">Upload a model</h2>

          {available.length === 0 ? (
            <p className="text-sm text-slate-600">
              Every eligible Place already has a model, or there are no unarchived Places to attach one to.
            </p>
          ) : (
            <form action={uploadPlaceModelAction} className="space-y-3">
              <Select label="Place" name="placeId" required>
                {available.map((place) => (
                  <option key={place.id} value={place.id}>
                    {place.name} ({place.category})
                  </option>
                ))}
              </Select>

              <label className="block space-y-1">
                <span className="text-sm font-medium text-slate-700">Model file</span>
                <input
                  type="file"
                  name="model"
                  accept=".glb,model/gltf-binary"
                  required
                  className="block w-full text-sm"
                />
                <span className="block text-xs text-slate-500">
                  Binary glTF (.glb), up to {maxMegabytes} MB. New models start as drafts and are invisible to guests
                  until enabled.
                </span>
              </label>

              <Button type="submit">Upload model</Button>
            </form>
          )}
        </Card>
      )}

      <Card className="space-y-3">
        <h2 className="font-medium">Models</h2>

        {rows.length === 0 ? (
          <EmptyState title="No models yet" description="Attach a .glb to a Place to see it on the map." />
        ) : (
          <ul className="space-y-2">
            {rows.map(({ model, placeName, placeArchivedAt }) => (
              <li key={model.id} className="rounded border border-slate-200 px-3 py-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-900">{placeName}</p>
                    <p className="text-xs text-slate-500">
                      {model.status === "enabled" ? "Visible to guests" : "Draft — not shown"}
                      {placeArchivedAt && " · place archived"} · {model.targetHeightMeters} m tall ·{" "}
                      {Math.round(model.fileSizeBytes / 1024)} KB
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link href={`/admin/models/${model.id}`} className="text-sm text-slate-700 underline">
                      Placement
                    </Link>
                    <form action={deletePlaceModelAction}>
                      <input type="hidden" name="id" value={model.id} />
                      <Button type="submit" variant="secondary">
                        Remove
                      </Button>
                    </form>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
