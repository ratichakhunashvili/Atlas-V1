import { distanceMeters } from "@/lib/geo";
import type { PlaceMapPoint } from "@/db/queries/places";
import type { Coordinates } from "@/services/location";
import { describePriceLevel } from "@/services/advisor/preference-ranking";

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function PlaceDetailsPanel({
  place,
  userCoords,
  modelDisplacementMeters = 0,
  onClose,
}: {
  place: PlaceMapPoint | null;
  userCoords: Coordinates | null;
  /** How far this Place's 3D model is drawn from its real location, when it has one and it is displaced. */
  modelDisplacementMeters?: number;
  onClose: () => void;
}) {
  if (!place) return null;

  const distance = userCoords
    ? distanceMeters(
        { lat: userCoords.latitude, lng: userCoords.longitude },
        { lat: place.latitude, lng: place.longitude }
      )
    : null;

  return (
    <div className="absolute inset-x-3 bottom-3 z-10 max-w-sm rounded-xl border border-slate-200 bg-white/95 p-4 shadow-lg backdrop-blur">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute right-2 top-2 rounded-md px-2 py-1 text-sm text-slate-400 hover:bg-slate-100 hover:text-slate-600"
      >
        ×
      </button>
      <p className="pr-6 text-sm font-semibold text-slate-900">{place.name}</p>
      <p className="text-xs uppercase tracking-wide text-slate-500">{place.category}</p>
      {place.description && <p className="mt-2 text-sm text-slate-600">{place.description}</p>}
      {place.address && <p className="mt-1 text-xs text-slate-500">{place.address}</p>}
      {describePriceLevel(place.priceLevel) && (
        <p className="mt-1 text-xs text-slate-500">Price level: {describePriceLevel(place.priceLevel)}</p>
      )}
      {modelDisplacementMeters >= 10 && (
        <p className="mt-1 text-xs text-slate-500">
          Its 3D model is drawn about {formatDistance(modelDisplacementMeters)} from the real location. The pin marks where
          the place really is, and directions and check-in always use that spot.
        </p>
      )}
      {distance !== null && <p className="mt-1 text-xs text-slate-500">{formatDistance(distance)} away</p>}
    </div>
  );
}
