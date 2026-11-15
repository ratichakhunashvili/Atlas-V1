"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { simulateScanAction } from "@/features/plan/actions";
import { AtlasIcon } from "./asset";
import { PendingSubmit } from "./pending-submit";
import type { CheckInMethod } from "@/db/schema";
import { acceptedProofs, useStopCheckIn } from "./use-stop-check-in";

// The camera library is only loaded when the guest actually opens the scanner.
const QrScannerModal = dynamic(() => import("@/components/qr/qr-scanner-modal").then((m) => m.QrScannerModal), { ssr: false });

/*
 * "Go to <place>": check in by scanning the place's Atlas QR code and/or by location, offering only the ways the
 * stop accepts (its saved method, which an admin chose for the Place). Either way the server decides —
 * this component only collects the scanned text or a position reading and forwards it. Success opens the
 * Achievement unlocked screen for this stop.
 */
export function CheckInPanel({
  stopId,
  placeName,
  checkInMethod,
  testScan,
}: {
  stopId: string;
  placeName: string;
  checkInMethod: CheckInMethod;
  testScan: boolean;
}) {
  const [scanning, setScanning] = useState(false);
  const proofs = acceptedProofs(checkInMethod);
  const { error, working, checkInWithCode, checkInByLocation } = useStopCheckIn({ stopId, placeName });

  async function onScan(decodedText: string) {
    setScanning(false);
    await checkInWithCode(decodedText);
  }

  const busy = working !== null;

  return (
    <div className="flex w-full flex-col items-start gap-[8px]">
      {proofs.qr !== proofs.gps ? (
        <p className="font-manrope text-[14px] leading-[19px] text-atlas-slate">
          {proofs.qr ? "This stop is checked in with its QR code at the counter." : "This stop is checked in with your location when you arrive."}
        </p>
      ) : null}
      {proofs.qr ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => setScanning(true)}
          className="flex h-[48px] w-full items-center justify-center gap-[8px] rounded-[12px] bg-atlas-teal font-manrope text-[15px] font-semibold text-atlas-paper disabled:opacity-70"
        >
          <AtlasIcon src="/atlas-ui/icon-qr-light-17.svg" size={17} />
          {working === "qr" ? "Checking the code…" : "Scan the QR code"}
        </button>
      ) : null}
      {proofs.gps ? (
        <button
          type="button"
          disabled={busy}
          onClick={checkInByLocation}
          className={`flex h-[48px] w-full items-center justify-center rounded-[12px] font-manrope text-[15px] font-semibold disabled:opacity-70 ${
            proofs.qr ? "border border-atlas-teal text-atlas-teal" : "bg-atlas-teal text-atlas-paper"
          }`}
        >
          {working === "gps" ? "Checking your location…" : "Check in with my location"}
        </button>
      ) : null}
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
