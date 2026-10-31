"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getDirectionsToStopAction } from "@/features/advisor/actions";
import { getCurrentPosition, locationService } from "@/services/location";
import { AtlasBottomBar } from "../bottom-bar";
import { useMapScene } from "./scene";

/*
 * Route · Walking route — Figma frame 1:731 — on real data: the walking line from where the guest is to the place
 * they chose, on the one shared map. The destination is resolved on the server from the guest's own stop; this
 * screen only sends its own position. The line is drawn once (and again on "Refresh route"); the "you" dot follows
 * the shared location service without re-routing.
 */

type LngLat = [number, number];
type Route = { line: LngLat[]; minutes: number; meters: number; from: "you" | "hotel" };

const SHEET = 210;

function distance(meters: number) {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function LiveRoute({
  stopId,
  placeName,
  placeAt,
  hotelName,
  hotelAt,
}: {
  stopId: string;
  placeName: string;
  placeAt: LngLat;
  hotelName: string;
  hotelAt: LngLat;
}) {
  const [route, setRoute] = useState<Route | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [youAt, setYouAt] = useState<LngLat | undefined>(undefined);

  // The live "you" dot: the one shared location service, started for this screen and stopped when it closes.
  useEffect(() => {
    const unsubscribe = locationService.onChange((state) => {
      if (state.coords) setYouAt([state.coords.longitude, state.coords.latitude]);
    });
    locationService.start();
    return () => {
      unsubscribe();
      locationService.stop();
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let origin: { lat: number; lng: number; from: "you" | "hotel" };
    try {
      const position = await getCurrentPosition({ fresh: true });
      origin = { lat: position.latitude, lng: position.longitude, from: "you" };
    } catch {
      // Location off or unavailable: route from the hotel, and say so.
      origin = { lat: hotelAt[1], lng: hotelAt[0], from: "hotel" };
    }
    const result = await getDirectionsToStopAction(stopId, origin.lat, origin.lng);
    setLoading(false);
    if (!result.ok) {
      setError(result.reason === "stop_unavailable" ? "This place isn't available through your hotel any more." : "We couldn't get a walking route right now. Try again.");
      return;
    }
    setRoute({
      line: result.route.geometry.geometry.coordinates as LngLat[],
      minutes: Math.max(1, Math.round(result.route.durationSeconds / 60)),
      meters: result.route.distanceMeters,
      from: origin.from,
    });
  }, [stopId, hotelAt]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetching the route once when the screen opens
    void load();
  }, [load]);

  useMapScene({
    places: [{ id: stopId, marker: "route-destination", at: placeAt }],
    hotel: true,
    hotelAt,
    you: false,
    routeLine: route?.line,
    youAt,
    bottomInset: 96 + SHEET,
    allowTilt: false,
    panel: true,
  });

  return (
    <div className="pointer-events-none absolute inset-0">
      <section
        aria-label={`Walking to ${placeName}`}
        className="pointer-events-auto absolute inset-x-0 flex flex-col gap-[10px] rounded-t-[22px] bg-atlas-paper px-[16px] pb-[12px] pt-[14px] shadow-[0px_-4px_18px_0px_rgba(28,41,41,0.1)] wide:bottom-[16px] wide:left-[16px] wide:right-auto wide:w-[var(--atlas-panel-w)] wide:rounded-[22px]"
        style={{ bottom: "var(--atlas-nav-h)", minHeight: SHEET }}
      >
        <p className="font-manrope text-[12px] font-semibold uppercase leading-[16px] tracking-[0.44px] text-atlas-slate">Walking route</p>
        <h1 className="font-grotesk text-[20px] font-bold leading-[26px] text-atlas-teal [overflow-wrap:anywhere]">{placeName}</h1>
        <p role="status" aria-live="polite" className="font-manrope text-[14px] leading-[19px] text-atlas-ink">
          {loading
            ? "Finding the walking route…"
            : error
              ? error
              : route
                ? `${route.minutes} min walk · ${distance(route.meters)}${route.from === "hotel" ? ` · from ${hotelName} (your location is off)` : ""}`
                : null}
        </p>
        <div className="flex w-full gap-[8px]">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="flex h-[44px] flex-1 items-center justify-center rounded-[12px] border border-atlas-teal font-manrope text-[14px] font-semibold text-atlas-teal disabled:opacity-60"
          >
            Refresh route
          </button>
          <Link
            href="/plan"
            className="flex h-[44px] flex-1 items-center justify-center rounded-[12px] bg-atlas-teal font-manrope text-[14px] font-semibold text-atlas-paper"
          >
            I&apos;m here — check in
          </Link>
        </div>
      </section>
      <div className="pointer-events-auto absolute bottom-0 left-0 right-0">
        <AtlasBottomBar active="missions" />
      </div>
    </div>
  );
}
