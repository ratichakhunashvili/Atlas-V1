"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { ItineraryDay, ItineraryStop } from "@/db/schema";
import { Button } from "@/components/shared/button";
import { Card } from "@/components/shared/card";
import { Field } from "@/components/shared/field";
import { checkInQrAction } from "@/features/advisor/actions";
import type { QrCheckInResult } from "@/services/advisor/check-in-qr";

// html5-qrcode touches browser-only camera APIs — must never be evaluated
// during server-side rendering.
const QrScannerModal = dynamic(() => import("@/components/qr/qr-scanner-modal").then((m) => m.QrScannerModal), {
  ssr: false,
});

export function QrCheckInTestForm({
  day,
  stopsWithTokens,
  regenerated,
}: {
  day: ItineraryDay;
  stopsWithTokens: Array<{ stop: ItineraryStop; qrToken: string | null }>;
  regenerated: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [qrToken, setQrToken] = useState("");
  const [result, setResult] = useState<QrCheckInResult | null>(null);

  const submit = (token: string) => {
    startTransition(async () => {
      const outcome = await checkInQrAction(token);
      setResult(outcome);
      if (outcome.ok) router.refresh();
    });
  };

  const handleScan = (decodedText: string) => {
    setScannerOpen(false);
    submit(decodedText);
  };

  return (
    <div className="space-y-6">
      <Card className="space-y-1 text-sm">
        <p>
          <span className="font-medium">Day:</span> #{day.dayNumber} — generated {day.generatedAt.toISOString()}
          {regenerated ? " (just generated/regenerated)" : " (existing, returned as-is)"}
        </p>
        <p>
          <span className="font-medium">Day completedAt:</span> {day.completedAt ? day.completedAt.toISOString() : "null"}
        </p>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-medium">Stops</h2>
        <ol className="space-y-1 text-sm">
          {[...stopsWithTokens]
            .sort((a, b) => a.stop.position - b.stop.position)
            .map(({ stop, qrToken: token }) => (
              <li key={stop.id} className="flex flex-col gap-1 rounded border border-slate-200 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    #{stop.position} {stop.name} {stop.isHotelStop && "(hotel filler)"} — {stop.checkInMethod}
                  </span>
                  <span className={stop.visitedAt ? "text-green-600" : "text-slate-400"}>
                    {stop.visitedAt ? `visited ${stop.visitedAt.toISOString()}` : "unvisited"}
                  </span>
                </div>
                {token && (
                  <button
                    type="button"
                    onClick={() => setQrToken(token)}
                    className="self-start font-mono text-xs text-slate-500 underline hover:text-slate-800"
                    title="Click to copy this Place's qrToken into the manual field below (dev convenience only)"
                  >
                    qrToken: {token}
                  </button>
                )}
              </li>
            ))}
        </ol>
      </Card>

      <Card className="space-y-3">
        <h2 className="font-medium">Test QR check-in</h2>
        <p className="text-xs text-slate-500">
          Use the real camera scanner, or paste/type a token directly for deterministic testing (including
          deliberately-wrong tokens).
        </p>

        <Button type="button" variant="secondary" onClick={() => setScannerOpen(true)}>
          Start QR Scanner
        </Button>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[16rem] flex-1">
            <Field label="QR token" name="qrToken" value={qrToken} onChange={(e) => setQrToken(e.target.value)} />
          </div>
          <Button type="button" disabled={pending || !qrToken} onClick={() => submit(qrToken)}>
            {pending ? "Checking…" : "Submit QR"}
          </Button>
        </div>
      </Card>

      {result && (
        <Card className="space-y-1">
          <h2 className="font-medium">Last server result</h2>
          <pre data-testid="qr-result" className="overflow-x-auto rounded bg-slate-900 p-3 text-xs text-slate-100">
            {JSON.stringify(result, null, 2)}
          </pre>
        </Card>
      )}

      {scannerOpen && <QrScannerModal onClose={() => setScannerOpen(false)} onScan={handleScan} />}
    </div>
  );
}
