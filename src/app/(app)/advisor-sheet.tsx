"use client";

import { useEffect, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/button";
import { distanceMeters } from "@/lib/geo";
import { getCurrentPosition, locationService, type LocationState } from "@/services/location";
import type { AdvisorStopView, CurrentItineraryState } from "@/services/advisor/current-itinerary";
import {
  checkInGpsAction,
  checkInQrAction,
  generateItineraryAction,
  getDirectionsToStopAction,
  removeUnavailableStopAction,
  replaceUnavailableStopsAction,
} from "@/features/advisor/actions";
import {
  directionsFailureMessage,
  generationFailureMessage,
  gpsCheckInFailureMessage,
  planRepairFailureMessage,
  qrCheckInFailureMessage,
  removeStopFailureMessage,
} from "./advisor-messages";

// html5-qrcode touches browser-only camera APIs — must never be evaluated
// during server-side rendering. Reuses Step 7's one scanner component
// exactly; this file never decides whether a scanned code is valid.
const QrScannerModal = dynamic(() => import("@/components/qr/qr-scanner-modal").then((m) => m.QrScannerModal), { ssr: false });

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "";
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.round((seconds % 3600) / 60);
  return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
}

// A bottom overlay anchored inside the map's own relatively-positioned
// container (see page.tsx) — the map stays mounted and visible behind it,
// never a separate page section. Expanded state scrolls internally
// (max-h + overflow-y-auto) so it can never grow to cover the whole
// viewport on a short phone screen.
const SHEET_BASE =
  "absolute inset-x-0 bottom-0 z-20 rounded-t-2xl border-t border-slate-200 bg-white/97 px-4 pb-4 pt-3 shadow-lg backdrop-blur";

export function AdvisorSheet({
  state,
  highlightedStopId,
  onHighlightStop,
}: {
  state: CurrentItineraryState;
  highlightedStopId: string | null;
  onHighlightStop: (id: string | null) => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [checkInMessage, setCheckInMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [scannerStopId, setScannerStopId] = useState<string | null>(null);
  const [directions, setDirections] = useState<{ distanceMeters: number; durationSeconds: number } | null>(null);
  const [directionsError, setDirectionsError] = useState<string | null>(null);
  const [locationState, setLocationState] = useState<LocationState>(locationService.getState());
  // Explicit plan repair when a pending stop becomes unavailable. Nothing here runs on its own:
  // each step is a deliberate guest action, confirmed before the server is called.
  const [confirmingRepair, setConfirmingRepair] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);
  const [repairNotice, setRepairNotice] = useState<string | null>(null);
  const [offerRemoval, setOfferRemoval] = useState(false);

  // Subscribes to the SAME location-service singleton AtlasMap already
  // drives — a second subscriber, never a second GPS implementation. Only
  // used here to show "how far is my current stop," never to decide a
  // check-in (that 150m decision stays entirely server-side).
  useEffect(() => locationService.onChange(setLocationState), []);

  function runGenerate() {
    setGenerateError(null);
    startTransition(async () => {
      const result = await generateItineraryAction();
      if (!result.ok) {
        setGenerateError(generationFailureMessage(result.reason));
        return;
      }
      setExpanded(true);
      router.refresh();
    });
  }

  function runReplaceUnavailable() {
    setRepairError(null);
    setRepairNotice(null);
    startTransition(async () => {
      const result = await replaceUnavailableStopsAction();
      setConfirmingRepair(false);
      if (!result.ok) {
        setRepairError(planRepairFailureMessage(result.reason));
        // No replacement exists: offer an explicit way to remove the unavailable stop(s). Nothing was changed.
        if (result.reason === "no_replacement_available") setOfferRemoval(true);
        return;
      }
      setOfferRemoval(false);
      setRepairNotice(
        result.droppedWithoutReplacement > 0
          ? `Updated: ${result.replaced} replaced, ${result.droppedWithoutReplacement} removed with no replacement available.`
          : `Updated: ${result.replaced} unavailable ${result.replaced === 1 ? "stop" : "stops"} replaced.`
      );
      router.refresh();
    });
  }

  function runRemoveStop(stop: AdvisorStopView) {
    setRepairError(null);
    setRepairNotice(null);
    startTransition(async () => {
      const result = await removeUnavailableStopAction(stop.id);
      if (!result.ok) {
        setRepairError(removeStopFailureMessage(result.reason));
        return;
      }
      setRepairNotice(`Removed ${stop.name} from today's route. It stays in your history.`);
      router.refresh();
    });
  }

  function runGpsCheckIn(stop: AdvisorStopView) {
    setCheckInMessage(null);
    startTransition(async () => {
      let coords;
      try {
        coords = await getCurrentPosition();
      } catch (error) {
        setCheckInMessage({ kind: "error", text: error instanceof Error ? error.message : "Could not get your location." });
        return;
      }
      const result = await checkInGpsAction(stop.id, coords.latitude, coords.longitude);
      if (!result.ok) {
        setCheckInMessage({ kind: "error", text: gpsCheckInFailureMessage(result.reason) });
        return;
      }
      setCheckInMessage({ kind: "success", text: result.alreadyVisited ? "Already checked in." : "✓ Stop completed" });
      setDirections(null);
      router.refresh();
    });
  }

  function runQrCheckIn(decodedText: string) {
    setScannerStopId(null);
    setCheckInMessage(null);
    startTransition(async () => {
      const result = await checkInQrAction(decodedText);
      if (!result.ok) {
        setCheckInMessage({ kind: "error", text: qrCheckInFailureMessage(result.reason) });
        return;
      }
      setCheckInMessage({ kind: "success", text: result.alreadyVisited ? "Already checked in." : "✓ Stop completed" });
      setDirections(null);
      router.refresh();
    });
  }

  function runStartNavigation(stop: AdvisorStopView) {
    setDirectionsError(null);
    startTransition(async () => {
      let coords;
      try {
        coords = await getCurrentPosition();
      } catch (error) {
        setDirectionsError(error instanceof Error ? error.message : "Could not get your location.");
        return;
      }
      const result = await getDirectionsToStopAction(stop.id, coords.latitude, coords.longitude);
      if (!result.ok) {
        setDirectionsError(directionsFailureMessage(result.reason));
        return;
      }
      setDirections({ distanceMeters: result.route.distanceMeters, durationSeconds: result.route.durationSeconds });
    });
  }

  if (state.status === "no_active_stay") {
    return (
      <div className={SHEET_BASE}>
        <p className="text-sm font-medium text-slate-900">Check into a hotel to activate your Advisor.</p>
      </div>
    );
  }

  if (state.status === "no_itinerary_yet") {
    return (
      <div className={SHEET_BASE}>
        <p className="text-sm font-medium text-slate-900">Today&apos;s Advisor</p>
        <p className="mt-1 text-sm text-slate-600">
          You&apos;re checked in at {state.hotelName}. Tell us when you&apos;re free — we&apos;ll figure out what you can do.
        </p>
        {generateError && <p className="mt-2 text-sm text-red-600">{generateError}</p>}
        <Button type="button" className="mt-3" disabled={pending} onClick={runGenerate}>
          {pending ? "Planning your day…" : "Create today's route"}
        </Button>
      </div>
    );
  }

  const userCoords = locationState.coords;
  const currentStop = state.currentStop;
  const distanceToCurrent =
    userCoords && currentStop
      ? distanceMeters({ lat: userCoords.latitude, lng: userCoords.longitude }, { lat: currentStop.latitude, lng: currentStop.longitude })
      : null;

  if (!expanded) {
    return (
      <button
        type="button"
        className={`${SHEET_BASE} flex w-full items-center justify-between text-left`}
        onClick={() => setExpanded(true)}
      >
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {state.completedAt ? "🎉 Route complete" : "Today's Route"}
          </p>
          <p className="text-xs text-slate-500">
            {state.stopCount} stops{state.totalDurationSeconds !== null && ` · ${formatDuration(state.totalDurationSeconds)} total`}
          </p>
          {state.hasUnavailableStops && <p className="text-xs font-medium text-amber-700">⚠ A stop is no longer available — update needed</p>}
        </div>
        <span className="shrink-0 text-xs font-medium text-slate-500">View itinerary ▲</span>
      </button>
    );
  }

  const visitedCount = state.stops.filter((s) => s.status === "completed").length;

  return (
    <div className={`${SHEET_BASE} max-h-[70vh] overflow-y-auto`}>
      <button type="button" className="flex w-full items-center justify-between text-left" onClick={() => setExpanded(false)}>
        <p className="text-sm font-semibold text-slate-900">Today&apos;s Route</p>
        <span className="text-xs font-medium text-slate-500">▼</span>
      </button>

      <p className="mt-1 text-xs text-slate-500">
        Progress {visitedCount} / {state.stops.length} completed
        {state.totalDurationSeconds !== null && ` · ${formatDuration(state.totalDurationSeconds)} total route time`}
      </p>

      <div className="mt-3 flex gap-2">
        <Button type="button" variant="secondary" disabled={pending} onClick={runGenerate}>
          {pending ? "Working…" : "Regenerate route"}
        </Button>
      </div>
      {generateError && <p className="mt-2 text-sm text-red-600">{generateError}</p>}

      {state.hasUnavailableStops && (
        <div role="alert" className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-semibold text-amber-900">Some stops are no longer available</p>
          <p className="mt-1 text-xs text-amber-800">
            {state.stops
              .filter((stop) => stop.status === "unavailable")
              .map((stop) => stop.name)
              .join(", ")}{" "}
            {state.blockedByUnavailableStop
              ? "is no longer offered through your hotel, so it and the stops after it are on hold."
              : "is no longer offered through your hotel. Your earlier stops can still be checked in."}{" "}
            Your route only changes if you choose to update it. Completed stops are never changed.
          </p>
          {!confirmingRepair ? (
            <Button type="button" className="mt-2" disabled={pending} onClick={() => setConfirmingRepair(true)}>
              Update my plan
            </Button>
          ) : (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-amber-900">
                We&apos;ll replace only the unavailable stops with other approved experiences. Your completed stops and your other
                stops stay exactly as they are.
              </p>
              <div className="flex gap-2">
                <Button type="button" disabled={pending} onClick={runReplaceUnavailable}>
                  {pending ? "Updating…" : "Replace unavailable stops"}
                </Button>
                <Button type="button" variant="secondary" disabled={pending} onClick={() => setConfirmingRepair(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
          {offerRemoval && (
            <div className="mt-2 space-y-1">
              <p className="text-xs text-amber-900">Nothing was changed. You can remove an unavailable stop instead (it stays in your history):</p>
              {state.stops
                .filter((stop) => stop.status === "unavailable")
                .map((stop) => (
                  <Button key={stop.id} type="button" variant="secondary" disabled={pending} onClick={() => runRemoveStop(stop)}>
                    Remove {stop.name}
                  </Button>
                ))}
            </div>
          )}
        </div>
      )}
      {repairError && <p className="mt-2 text-sm text-red-600">{repairError}</p>}
      {repairNotice && <p className="mt-2 text-sm text-green-700">{repairNotice}</p>}

      {state.stops.length === 0 && <p className="mt-3 text-sm text-slate-600">No stops are left in today&apos;s route.</p>}

      {state.completedAt ? (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3">
          <p className="text-sm font-semibold text-green-800">🎉 Route complete</p>
          <p className="mt-1 text-xs text-green-700">You completed today&apos;s itinerary.</p>
        </div>
      ) : currentStop ? (
        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Current stop</p>
          {currentStop.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentStop.imageUrl} alt="" className="mt-2 h-28 w-full rounded-md object-cover" />
          )}
          <p className="mt-2 text-sm font-semibold text-slate-900">
            {currentStop.isHotelStop ? `🏨 ${currentStop.name}` : currentStop.name}
          </p>
          <p className="text-xs text-slate-500">{currentStop.category ?? (currentStop.isHotelStop ? "Hotel activity" : "")}</p>
          {distanceToCurrent !== null && <p className="mt-1 text-xs text-slate-500">{formatDistance(distanceToCurrent)} away</p>}
          {directions && (
            <p className="mt-1 text-xs text-slate-500">
              Walking: {formatDistance(directions.distanceMeters)} · ~{formatDuration(directions.durationSeconds)}
            </p>
          )}
          {directionsError && <p className="mt-1 text-xs text-red-600">{directionsError}</p>}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={pending} onClick={() => runStartNavigation(currentStop)}>
              Start navigation
            </Button>
            {currentStop.checkInMethod === "qr" ? (
              <Button type="button" disabled={pending} onClick={() => setScannerStopId(currentStop.id)}>
                Scan QR
              </Button>
            ) : currentStop.checkInMethod === "gps" ? (
              <Button type="button" disabled={pending} onClick={() => runGpsCheckIn(currentStop)}>
                {pending ? "Checking location…" : "I've arrived"}
              </Button>
            ) : null}
          </div>
          {checkInMessage && (
            <p className={`mt-2 text-sm ${checkInMessage.kind === "error" ? "text-red-600" : "text-green-700"}`}>
              {checkInMessage.text}
            </p>
          )}
        </div>
      ) : null}

      <ol className="mt-4 space-y-1 text-sm">
        {state.stops.map((stop) => (
          <li
            key={stop.id}
            className={`flex items-center justify-between rounded px-2 py-1.5 ${
              stop.id === highlightedStopId ? "bg-slate-100" : ""
            }`}
            onClick={() => onHighlightStop(stop.id)}
          >
            <span className="flex items-center gap-2">
              <span
                className={
                  stop.status === "completed"
                    ? "text-green-600"
                    : stop.status === "current"
                      ? "font-semibold text-slate-900"
                      : stop.status === "unavailable"
                        ? "text-amber-600"
                        : "text-slate-400"
                }
              >
                {stop.status === "completed" ? "✓" : stop.status === "current" ? "→" : stop.status === "unavailable" ? "⚠" : "○"}
              </span>
              <span
                className={
                  stop.status === "unavailable" ? "text-slate-500 line-through" : stop.status === "upcoming" ? "text-slate-400" : "text-slate-900"
                }
              >
                {stop.isHotelStop ? `🏨 ${stop.name}` : stop.name}
              </span>
              {stop.status === "unavailable" && <span className="text-xs font-medium text-amber-700">Unavailable</span>}
              {stop.status === "upcoming" && state.blockedByUnavailableStop && <span className="text-xs text-slate-400">on hold</span>}
            </span>
          </li>
        ))}
      </ol>

      {scannerStopId && <QrScannerModal onClose={() => setScannerStopId(null)} onScan={runQrCheckIn} />}
    </div>
  );
}
