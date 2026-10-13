"use client";

import { useState } from "react";
import { AtlasMap } from "@/components/map/atlas-map";
import type { PlaceMapPoint } from "@/db/queries/places";
import type { CurrentItineraryState } from "@/services/advisor/current-itinerary";
import { AdvisorSheet } from "./advisor-sheet";

/**
 * The one piece of client state shared between the map (tapping a stop
 * marker) and the sheet (tapping a stop in the list): which stop is
 * currently highlighted for VIEWING. This never affects which stop is
 * check-in eligible — that stays entirely server-derived in
 * CurrentItineraryState.currentStop (see services/advisor/current-itinerary.ts).
 */
export function AdvisorMapSection({ places, itinerary }: { places: PlaceMapPoint[]; itinerary: CurrentItineraryState }) {
  const [highlightedStopId, setHighlightedStopId] = useState<string | null>(null);
  const stops = itinerary.status === "ready" ? itinerary.stops : undefined;
  const route = itinerary.status === "ready" ? itinerary.routeGeometry : undefined;

  return (
    <div className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-lg border border-slate-200">
      <AtlasMap places={places} route={route} itineraryStops={stops} onItineraryStopSelect={setHighlightedStopId} />
      <AdvisorSheet state={itinerary} highlightedStopId={highlightedStopId} onHighlightStop={setHighlightedStopId} />
    </div>
  );
}
