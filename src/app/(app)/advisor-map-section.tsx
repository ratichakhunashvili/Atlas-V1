"use client";

import { useMemo, useState } from "react";
import { AtlasMap } from "@/components/map/atlas-map";
import type { PlaceMapPoint } from "@/db/queries/places";
import type { CurrentItineraryState } from "@/services/advisor/current-itinerary";
import { AdvisorSheet } from "./advisor-sheet";
import type { RouteGeometry } from "@/services/routing";
import type { GuestPlaceModel } from "@/services/map3d/guest-models";

/**
 * The one piece of client state shared between the map (tapping a stop
 * marker) and the sheet (tapping a stop in the list): which stop is
 * currently highlighted for VIEWING. This never affects which stop is
 * check-in eligible — that stays entirely server-derived in
 * CurrentItineraryState.currentStop (see services/advisor/current-itinerary.ts).
 *
 * ROUTE PREVIEW: once a plan has been explicitly generated, the map draws its whole saved route (hotel -> every
 * stop in order -> hotel), numbered stops and the hotel marker. Nothing is requested from Mapbox here — the line is
 * the geometry the optimizer already returned and the server already saved. The walking leg to the current stop,
 * fetched only when the guest asks for directions, is drawn in addition, never instead.
 */
export function AdvisorMapSection({
  places,
  itinerary,
  models,
}: {
  places: PlaceMapPoint[];
  itinerary: CurrentItineraryState;
  models: GuestPlaceModel[];
}) {
  const [highlightedStopId, setHighlightedStopId] = useState<string | null>(null);
  // Keyed to the plan it was fetched for, so a regenerated plan never shows a stale leg.
  const [leg, setLeg] = useState<{ planKey: string; geometry: RouteGeometry } | null>(null);

  const ready = itinerary.status === "ready" ? itinerary : null;
  const planKey = ready ? `${ready.dayId}:${new Date(ready.generatedAt).getTime()}` : null;
  const stops = ready?.stops;
  const directionsLeg = leg && leg.planKey === planKey ? leg.geometry : null;

  const hotelMarker = useMemo(
    () =>
      ready
        ? { latitude: ready.hotel.latitude, longitude: ready.hotel.longitude, label: "H", title: `${ready.hotel.name} — your route starts and ends here` }
        : undefined,
    [ready]
  );

  return (
    <div className="atlas-map-stage">
      <AtlasMap
        places={places}
        route={ready?.routeGeometry ?? null}
        routeFitKey={planKey}
        directionsLeg={directionsLeg}
        anchorMarker={hotelMarker}
        models={models}
        itineraryStops={stops}
        onItineraryStopSelect={setHighlightedStopId}
      />
      <AdvisorSheet
        state={itinerary}
        highlightedStopId={highlightedStopId}
        onHighlightStop={setHighlightedStopId}
        onCurrentLeg={(geometry) => planKey && setLeg({ planKey, geometry })}
      />
    </div>
  );
}
