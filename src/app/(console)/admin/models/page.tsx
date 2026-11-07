import Link from "next/link";
import { Alert } from "@/components/shared/alert";
import { Card } from "@/components/shared/card";
import { EmptyState } from "@/components/shared/empty-state";
import { listModelsForAdmin } from "@/db/queries/place-models";
import { listPlaces } from "@/db/queries/places";
import { storageService } from "@/services/storage/server";
import { MAX_MODEL_BYTES, modelStorageKey } from "@/services/map3d";
import { deletePlaceModelAction } from "@/features/place-models/actions";
import { ModelUploadForm } from "@/components/admin/model-upload-form";
import { ConfirmSubmit } from "@/components/admin/confirm-submit";

/**
 * 3D models attached to Places.
 *
 * If no object store is configured, that is stated up front and the upload form is
 * not offered — an admin should find out before choosing a file, not after.
 */
export const metadata = { title: "3D models" };

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
            <ModelUploadForm
              // Every outcome (a new list of places, or a new success/error message) resets the form, so it never keeps a
              // place that is gone or stays stuck on "Checking the file…" after a refusal.
              key={`${available.map((place) => place.id).join(",")}|${ok ?? ""}|${error ?? ""}`}
              places={available.map(({ id, name, category }) => ({ id, name, category }))}
              modelPath={modelStorageKey("{placeId}")}
              maxMegabytes={maxMegabytes}
            />
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
                      <ConfirmSubmit variant="secondary" confirm="Remove this 3D model? Guests stop seeing it on the map.">
                        Remove
                      </ConfirmSubmit>
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
