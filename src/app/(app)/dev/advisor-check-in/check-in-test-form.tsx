"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ItineraryDay, ItineraryStop } from "@/db/schema";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { Field } from "@/components/shared/field";
import { checkInGpsAction } from "@/features/advisor/actions";
import { getCurrentPosition } from "@/services/location";
import type { CheckInResult } from "@/services/advisor/check-in";

export function CheckInTestForm({
  day,
  stops,
}: {
  day: Pick<ItineraryDay, "dayNumber" | "generatedAt" | "completedAt">;
  stops: Array<Pick<ItineraryStop, "id" | "position" | "name" | "isHotelStop" | "checkInMethod" | "visitedAt">>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const firstUnvisited = [...stops].sort((a, b) => a.position - b.position).find((s) => s.visitedAt === null);
  const [stopId, setStopId] = useState(firstUnvisited?.id ?? stops[0]?.id ?? "");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [result, setResult] = useState<CheckInResult | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const useMyLocation = () => {
    setLocationError(null);
    getCurrentPosition()
      .then((coords) => {
        setLatitude(String(coords.latitude));
        setLongitude(String(coords.longitude));
      })
      .catch((err: unknown) => setLocationError(err instanceof Error ? err.message : "Could not get location."));
  };

  const submit = () => {
    const lat = Number(latitude);
    const lng = Number(longitude);
    startTransition(async () => {
      // Dev tool: types a position by hand, so it supplies evidence that passes
      // the server's limits — a precise fix taken right now. The limits themselves
      // are exercised by the unit tests, not by this form.
      const outcome = await checkInGpsAction(stopId, lat, lng, 10, Date.now());
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-1 text-sm">
        <p>
          <span className="font-medium">Day:</span> #{day.dayNumber} — generated {day.generatedAt.toISOString()}
          {" "}(read-only; opening this page never generates or changes the itinerary)
        </p>
        <p>
          <span className="font-medium">Day completedAt:</span> {day.completedAt ? day.completedAt.toISOString() : "null"}
        </p>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-medium">Stops</h2>
        <ol className="space-y-1 text-sm">
          {[...stops]
            .sort((a, b) => a.position - b.position)
            .map((stop) => (
              <li key={stop.id} className="flex items-center justify-between gap-2 rounded border border-slate-200 px-3 py-2">
                <span>
                  #{stop.position} {stop.name} {stop.isHotelStop && "(hotel filler)"} — {stop.checkInMethod}
                </span>
                <span className={stop.visitedAt ? "text-green-600" : "text-slate-400"}>
                  {stop.visitedAt ? `visited ${stop.visitedAt.toISOString()}` : "unvisited"}
                </span>
              </li>
            ))}
        </ol>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-medium">Test GPS check-in</h2>
        <p className="text-xs text-slate-500">
          Deliberately lets you pick any stop (not just the first unvisited one) so the &quot;wrong stop&quot;
          rejection can be exercised here too.
        </p>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Stop to attempt</span>
          <select
            value={stopId}
            onChange={(e) => setStopId(e.target.value)}
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            {[...stops]
              .sort((a, b) => a.position - b.position)
              .map((stop) => (
                <option key={stop.id} value={stop.id}>
                  #{stop.position} {stop.name} {stop.visitedAt ? "(visited)" : ""}
                </option>
              ))}
          </select>
        </label>

        <div className="flex flex-wrap items-end gap-2">
          <div className="w-40">
            <Field
              label="Latitude"
              name="latitude"
              value={latitude}
              onChange={(e) => setLatitude(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div className="w-40">
            <Field
              label="Longitude"
              name="longitude"
              value={longitude}
              onChange={(e) => setLongitude(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <Button type="button" variant="secondary" onClick={useMyLocation}>
            Use my location
          </Button>
        </div>
        {locationError && <p className="text-xs text-red-600">{locationError}</p>}

        <Button type="button" disabled={pending || !stopId} onClick={submit}>
          {pending ? "Checking…" : "Test GPS Check-in"}
        </Button>
      </Card>

      {result && (
        <Card className="space-y-1">
          <h2 className="font-medium">Last server result</h2>
          <pre data-testid="gps-result" className="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
            {JSON.stringify(result, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}
