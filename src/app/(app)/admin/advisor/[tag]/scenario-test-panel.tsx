"use client";

import { useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import {
  deleteAdvisorTestScenarioAction,
  generateTestItineraryAction,
  promoteTestUserToAdminAction,
  seedPreviousDayHistoryAction,
  testGpsCheckInAction,
  testQrCheckInAction,
} from "@/features/advisor-testing/actions";

const QrScannerModal = dynamic(() => import("@/components/qr/qr-scanner-modal").then((m) => m.QrScannerModal), {
  ssr: false,
});

type ScenarioPlaceView = {
  id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  qrToken: string | null;
  isPartner: boolean;
  partnerPriority: number | null;
};

type ScenarioInfo = {
  userId: string;
  userEmail: string;
  userRole: "user" | "admin";
  hotelId: string;
  hotelPlaceId: string;
  places: ScenarioPlaceView[];
};

type DayView = {
  id: string;
  dayNumber: number;
  stopCount: number;
  totalDurationSeconds: number | null;
  hasRouteGeoJson: boolean;
  generatedAt: string;
  completedAt: string | null;
} | null;

type StopView = {
  id: string;
  position: number;
  name: string;
  category: string | null;
  latitude: number;
  longitude: number;
  isHotelStop: boolean;
  checkInMethod: string;
  visitedAt: string | null;
  isPartner: boolean;
  qrToken: string | null;
};

type LogEntry = { label: string; pass: boolean | null; detail: string; timestamp: string };

export function ScenarioTestPanel({
  tag,
  scenario,
  day,
  stops,
  cooldownActive,
}: {
  tag: string;
  scenario: ScenarioInfo;
  day: DayView;
  stops: StopView[];
  cooldownActive: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [log, setLog] = useState<LogEntry[]>([]);
  const [scannerOpenFor, setScannerOpenFor] = useState<string | null>(null);

  const sortedStops = [...stops].sort((a, b) => a.position - b.position);
  const firstUnvisited = sortedStops.find((s) => s.visitedAt === null) ?? null;

  function pushLog(entry: Omit<LogEntry, "timestamp">) {
    setLog((prev) => [{ ...entry, timestamp: new Date().toISOString() }, ...prev]);
  }

  function runGenerate() {
    startTransition(async () => {
      const result = await generateTestItineraryAction(tag);
      pushLog({
        label: "Generate Itinerary",
        pass: result.ok,
        detail: result.ok
          ? `ok — regenerated=${result.regenerated}, day #${result.itinerary.day.dayNumber}, ${result.itinerary.stops.length} stops`
          : `reason=${result.reason} — ${result.message}`,
      });
      router.refresh();
    });
  }

  function runGps(stop: StopView, mode: "success" | "too_far" | "invalid") {
    const isFirst = firstUnvisited?.id === stop.id;
    const [lat, lng] =
      mode === "success"
        ? [stop.latitude, stop.longitude]
        : mode === "too_far"
          ? [stop.latitude + 0.05, stop.longitude] // ~5.5km away, well outside 150m
          : [NaN, stop.longitude];

    startTransition(async () => {
      const result = await testGpsCheckInAction(tag, stop.id, lat, lng);
      const expectation =
        mode === "invalid"
          ? result.ok === false && "reason" in result && result.reason === "invalid_coordinates"
          : mode === "too_far"
            ? result.ok === false && "reason" in result && result.reason === "out_of_range"
            : isFirst
              ? result.ok === true
              : result.ok === false && "reason" in result && result.reason === "stop_not_next";

      pushLog({
        label: `GPS ${mode === "success" ? (isFirst ? "Success" : "Success (wrong order)") : mode === "too_far" ? "Too Far" : "Invalid Coordinates"} — ${stop.name}`,
        pass: expectation,
        detail: result.ok
          ? `ok — checkInMethod=${result.stop.checkInMethod}, alreadyVisited=${result.alreadyVisited}, dayCompleted=${result.dayCompleted}`
          : `reason=${"reason" in result ? result.reason : "?"} — ${result.message}`,
      });
      if (result.ok) router.refresh();
    });
  }

  function runQr(stop: StopView, token: string, label: string) {
    const isFirst = firstUnvisited?.id === stop.id;
    startTransition(async () => {
      const result = await testQrCheckInAction(tag, token);
      const expectation = isFirst
        ? result.ok === true
        : result.ok === false && "reason" in result && result.reason === "place_not_next";
      pushLog({
        label: `${label} — ${stop.name}`,
        pass: expectation,
        detail: result.ok
          ? `ok — checkInMethod=${result.stop.checkInMethod}, alreadyVisited=${result.alreadyVisited}, dayCompleted=${result.dayCompleted}`
          : `reason=${"reason" in result ? result.reason : "?"} — ${result.message}`,
      });
      if (result.ok) router.refresh();
    });
  }

  function runRepeat(stop: StopView) {
    startTransition(async () => {
      const result =
        stop.checkInMethod === "qr" && stop.qrToken
          ? await testQrCheckInAction(tag, stop.qrToken)
          : await testGpsCheckInAction(tag, stop.id, stop.latitude, stop.longitude);
      pushLog({
        label: `Repeat check-in — ${stop.name}`,
        pass: result.ok === true && "alreadyVisited" in result && result.alreadyVisited === true,
        detail: result.ok
          ? `ok — alreadyVisited=${result.alreadyVisited}`
          : `reason=${"reason" in result ? result.reason : "?"} — ${result.message}`,
      });
    });
  }

  function runInvalidQr() {
    startTransition(async () => {
      const result = await testQrCheckInAction(tag, `bogus-token-${Date.now()}`);
      pushLog({
        label: "Submit Invalid QR",
        pass: result.ok === false && "reason" in result && result.reason === "invalid_qr",
        detail: result.ok ? "unexpectedly ok" : `reason=${"reason" in result ? result.reason : "?"} — ${result.message}`,
      });
    });
  }

  function runWrongQr(stop: StopView) {
    const otherToken = scenario.places.find((p) => p.qrToken && p.qrToken !== stop.qrToken)?.qrToken;
    if (!otherToken) return;
    startTransition(async () => {
      const result = await testQrCheckInAction(tag, otherToken);
      pushLog({
        label: `Submit another Place's QR against current state`,
        pass: result.ok === false || (result.ok === true && result.alreadyVisited === true),
        detail: result.ok
          ? `ok — alreadyVisited=${result.alreadyVisited}`
          : `reason=${"reason" in result ? result.reason : "?"} — ${result.message}`,
      });
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-1 text-sm">
        <h2 className="font-medium">Scenario</h2>
        <p>User ID: <code>{scenario.userId}</code> ({scenario.userEmail}, role: {scenario.userRole})</p>
        <p>Hotel ID: <code>{scenario.hotelId}</code> — Hotel Place ID: <code>{scenario.hotelPlaceId}</code></p>
        <div className="flex gap-2 pt-2">
          <form action={() => startTransition(() => promoteTestUserToAdminAction(tag))}>
            <Button type="submit" variant="secondary" disabled={pending || scenario.userRole === "admin"}>
              Promote test user to admin (enables existing cooldown bypass)
            </Button>
          </form>
          <form action={() => startTransition(() => deleteAdvisorTestScenarioAction(tag))}>
            <Button type="submit" variant="danger" disabled={pending}>
              Delete Scenario
            </Button>
          </form>
        </div>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-medium">Test Places ({scenario.places.length})</h2>
        <ul className="space-y-1 text-xs">
          {scenario.places.map((p) => (
            <li key={p.id} className="rounded border border-slate-200 px-2 py-1">
              <code>{p.id}</code> — {p.name} — {p.category} — ({p.latitude.toFixed(5)}, {p.longitude.toFixed(5)}){" "}
              {p.isPartner && `— partner (priority ${p.partnerPriority ?? "none"})`} {p.qrToken && `— qrToken: ${p.qrToken}`}
            </li>
          ))}
        </ul>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-medium">Generate Itinerary</h2>
        <p className="text-xs text-slate-500">
          Calls the real generateItineraryForUser. {cooldownActive && "Cooldown is currently ACTIVE for this (non-admin) test user — generating now should return the existing itinerary unchanged."}
        </p>
        <Button type="button" onClick={runGenerate} disabled={pending}>
          {pending ? "Working…" : "Generate Itinerary"}
        </Button>
      </Card>

      {day && (
        <Card className="space-y-1 text-sm">
          <h2 className="font-medium">Itinerary Day</h2>
          <p>Day ID: <code>{day.id}</code> — Day number: {day.dayNumber} — Stop count: {day.stopCount}</p>
          <p>Total duration: {day.totalDurationSeconds ?? "null"}s — Route geometry exists: {String(day.hasRouteGeoJson)}</p>
          <p>Generated at: {day.generatedAt}</p>
          <p className={day.completedAt ? "font-medium text-green-700" : "text-slate-500"}>
            {day.completedAt ? `DAY COMPLETED — completedAt: ${day.completedAt}` : "Not yet completed"}
          </p>
        </Card>
      )}

      {sortedStops.length > 0 && (
        <Card className="space-y-3">
          <h2 className="font-medium">Itinerary Stops / Inspector</h2>
          <ul data-testid="itinerary-stops-list" className="space-y-2 text-sm">
            {sortedStops.map((stop) => {
              const isFirst = firstUnvisited?.id === stop.id;
              return (
                <li key={stop.id} className="space-y-2 rounded border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      #{stop.position} <code>{stop.id}</code> {stop.name}{" "}
                      {stop.isHotelStop && <span className="text-slate-500">(hotel filler)</span>}{" "}
                      {stop.isPartner && <span className="text-slate-500">(partner)</span>}{" "}
                      {stop.qrToken && <span className="text-slate-500">(QR enabled)</span>}
                    </span>
                    <span className={stop.visitedAt ? "text-green-600" : isFirst ? "font-medium text-slate-900" : "text-slate-400"}>
                      {stop.visitedAt ? `visited (${stop.checkInMethod}) ${stop.visitedAt}` : isFirst ? "→ next up" : "unvisited"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    category: {stop.category ?? "null"} — ({stop.latitude.toFixed(5)}, {stop.longitude.toFixed(5)}) — expected
                    method (advisory, not enforced by GPS): {stop.checkInMethod}
                  </p>

                  {stop.visitedAt === null ? (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="secondary" disabled={pending} onClick={() => runGps(stop, "success")}>
                        GPS Success
                      </Button>
                      <Button type="button" variant="secondary" disabled={pending} onClick={() => runGps(stop, "too_far")}>
                        GPS Too Far
                      </Button>
                      <Button type="button" variant="secondary" disabled={pending} onClick={() => runGps(stop, "invalid")}>
                        GPS Invalid Coordinates
                      </Button>
                      {stop.qrToken && (
                        <>
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={pending}
                            onClick={() => runQr(stop, stop.qrToken!, "Submit QR")}
                          >
                            Submit QR
                          </Button>
                          <Button type="button" variant="secondary" disabled={pending} onClick={() => setScannerOpenFor(stop.id)}>
                            Open Scanner
                          </Button>
                          <Button type="button" variant="secondary" disabled={pending} onClick={() => runWrongQr(stop)}>
                            Test Wrong QR (another Place&apos;s token)
                          </Button>
                        </>
                      )}
                    </div>
                  ) : (
                    <Button type="button" variant="secondary" disabled={pending} onClick={() => runRepeat(stop)}>
                      Repeat Check-in (idempotency test)
                    </Button>
                  )}

                  {scannerOpenFor === stop.id && (
                    <QrScannerModal
                      onClose={() => setScannerOpenFor(null)}
                      onScan={(decoded) => {
                        setScannerOpenFor(null);
                        runQr(stop, decoded, "Scanned QR");
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
          <Button type="button" variant="secondary" disabled={pending} onClick={runInvalidQr}>
            Test Invalid QR (bogus token)
          </Button>
        </Card>
      )}

      <Card className="space-y-2">
        <h2 className="font-medium">Seed previous-day difficulty history</h2>
        <p className="text-xs text-slate-500">
          Writes a synthetic, already-completed Day 1 directly (not through the real generation flow — see
          seedPreviousDayHistory&apos;s doc comment). Afterward, click &quot;Generate Itinerary&quot; above and inspect the
          resulting stop count — it comes entirely from the real difficulty service, not from this tool.
        </p>
        <div className="flex gap-2">
          {(["easy", "hard", "incomplete"] as const).map((outcome) => (
            <form key={outcome} action={() => startTransition(() => seedPreviousDayHistoryAction(tag, outcome))}>
              <Button type="submit" variant="secondary" disabled={pending}>
                Seed Day 1 ({outcome})
              </Button>
            </form>
          ))}
        </div>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-medium">Test Result Log</h2>
        {log.length === 0 ? (
          <p className="text-sm text-slate-500">No tests run yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {log.map((entry, index) => (
              <li key={index} className={entry.pass === false ? "text-red-600" : entry.pass === true ? "text-green-700" : ""}>
                {entry.pass === false ? "✗" : entry.pass === true ? "✓" : "•"} {entry.label} — {entry.detail}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
