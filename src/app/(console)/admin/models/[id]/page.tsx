import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/shared/alert";
import { PlacementEditor } from "@/components/map3d/placement-editor";
import { findModelById } from "@/db/queries/place-models";
import { findPlaceById } from "@/db/queries/places";
import { SUPPORTED_MODEL_REGION } from "@/db/schema";
import { updateModelSettingsAction } from "@/features/place-models/actions";

export const dynamic = "force-dynamic";

/**
 * How one model is drawn: a live map with the linked Place's real pin and the model's independent display anchor,
 * numeric controls for every part of the transform, a live preview, and explicit save-as-draft / publish actions.
 *
 * The Place is fixed. Everything here is display placement: moving the model never changes the Place's canonical
 * coordinates, its eligibility for any hotel, the route destination, check-in coordinates or the achievement.
 */
export default async function ModelPlacementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const { error, ok } = await searchParams;

  const model = await findModelById(id);
  if (!model) notFound();

  const place = await findPlaceById(model.placeId);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href="/admin/models" className="text-sm text-slate-600 underline">
          ← 3D models
        </Link>
        <h1 className="mt-2 text-xl font-semibold">Placement</h1>
        <p className="text-sm text-slate-600">
          {place?.name ?? "A place that is no longer listed"}
          {place && ` · real location ${place.latitude.toFixed(5)}, ${place.longitude.toFixed(5)}`}
        </p>
      </div>

      {error && <Alert>{error}</Alert>}
      {ok && <Alert variant="success">{ok}</Alert>}

      {place ? (
        <PlacementEditor
          action={updateModelSettingsAction.bind(null, model.id)}
          region={SUPPORTED_MODEL_REGION}
          place={{ id: place.id, name: place.name, latitude: place.latitude, longitude: place.longitude, category: place.category }}
          model={{
            fileUrl: model.fileUrl,
            status: model.status,
            targetHeightMeters: model.targetHeightMeters,
            rotationDegrees: model.rotationDegrees,
            pitchDegrees: model.pitchDegrees,
            rollDegrees: model.rollDegrees,
            elevationOffsetMeters: model.elevationOffsetMeters,
            scale: model.scale,
            scaleX: model.scaleX,
            scaleY: model.scaleY,
            scaleZ: model.scaleZ,
            anchorLatitude: model.anchorLatitude,
            anchorLongitude: model.anchorLongitude,
          }}
        />
      ) : (
        <Alert>The place this model belongs to no longer exists, so it can&apos;t be placed.</Alert>
      )}

      <p className="text-xs text-slate-500">
        Guests see this model in grey until they have a verified visit to {place?.name ?? "this place"}, and only if their
        hotel has approved the place. That is decided on the server, per guest.
      </p>
    </div>
  );
}
