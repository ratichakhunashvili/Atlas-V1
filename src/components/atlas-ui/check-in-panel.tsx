"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { gpsCheckInFailureMessage, qrCheckInFailureMessage } from "@/app/(app)/advisor-messages";
import { checkInGpsAction, checkInQrAction } from "@/features/advisor/actions";
import { simulateScanAction } from "@/features/plan/actions";
import { getCurrentPosition } from "@/services/location";
import { AtlasIcon } from "./asset";
import { PendingSubmit } from "./pending-submit";

// The camera library is only loaded when the guest actually opens the scanner.
const QrScannerModal = dynamic(() => import("@/components/qr/qr-scanner-modal").then((m) => m.QrScannerModal), { ssr: false });

/*
 * "Go to <place>": check in by scanning the place's Atlas QR code OR by location. Either way the server decides —
 * this component only collects the scanned text or a position reading and forwards it. Success opens the
 * Achievement unlocked screen for this stop.
 */
export function CheckInPanel({ stopId, placeName, testScan }: { stopId: string; placeName: string; testScan: boolean }) {
  const router = useRouter();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState<null | "qr" | "gps">(null);

  const unlocked = () => router.push(`/plan/unlocked?stop=${stopId}`);

  // Plain async handlers, not a transition: a navigation started after an awaited server action inside a
  // transition can be dropped, which left the guest on My plan after a successful check-in.
  async function onScan(decodedText: string) {
    setScanning(false);
    setError(null);
    setWorking("qr");
    const result = await checkInQrAction(decodedText);
    setWorking(null);
    if (!result.ok) return setError(qrCheckInFailureMessage(result.reason));
    // A code for a different place on the guest's day would name another stop; only this one opens its badge.
    if (result.stop.id !== stopId) return setError("That QR code belongs to a different place.");
    unlocked();
  }

  async function checkInByLocation() {
    setError(null);
    setWorking("gps");
    let position;
    try {
      position = await getCurrentPosition({ fresh: true });
    } catch (problem) {
      setWorking(null);
      return setError(problem instanceof Error ? `We couldn't get your location: ${problem.message}` : "We couldn't get your location.");
    }
    const result = await checkInGpsAction(stopId, position.latitude, position.longitude, position.accuracyMeters, position.capturedAtMs);
    setWorking(null);
    if (!result.ok) return setError(gpsCheckInFailureMessage(result.reason));
    unlocked();
  }

  const busy = working !== null;

  return (
    <div className="flex w-full flex-col items-start gap-[8px]">
      <button
        type="button"
        disabled={busy}
        onClick={() => setScanning(true)}
        className="flex h-[48px] w-full items-center justify-center gap-[8px] rounded-[12px] bg-atlas-teal font-manrope text-[15px] font-semibold text-atlas-paper disabled:opacity-70"
      >
        <AtlasIcon src="/atlas-ui/icon-qr-light-17.svg" size={17} />
        {working === "qr" ? "Checking the code…" : "Scan the QR code"}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={checkInByLocation}
        className="flex h-[48px] w-full items-center justify-center rounded-[12px] border border-atlas-teal font-manrope text-[15px] font-semibold text-atlas-teal disabled:opacity-70"
      >
        {working === "gps" ? "Checking your location…" : "Check in with my location"}
      </button>
      {testScan ? (
        <form action={simulateScanAction} className="w-full">
          <PendingSubmit
            pendingLabel="Simulating…"
            className="flex h-[44px] w-full items-center justify-center rounded-[12px] border border-dashed border-atlas-slate font-manrope text-[14px] font-semibold text-atlas-ink"
          >
            Simulate scan (test only)
          </PendingSubmit>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="w-full rounded-[10px] bg-atlas-danger-soft px-[12px] py-[10px] font-manrope text-[14px] leading-[19px] text-atlas-danger">
          {error}
        </p>
      ) : null}
      {scanning ? (
        <QrScannerModal
          onClose={() => setScanning(false)}
          onScan={onScan}
          title={`Scan ${placeName}'s QR code`}
          description="Point your camera at the Atlas QR code at this place, or type the code below it."
        />
      ) : null}
    </div>
  );
}
