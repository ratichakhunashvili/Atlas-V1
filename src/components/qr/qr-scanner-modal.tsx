"use client";

import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

const REGION_ID = "atlas-qr-scanner-region";

/**
 * html5-qrcode calls its internal camera <video> element's .play() without
 * handling the returned promise. If that element is torn down (e.g. we stop
 * the scanner right after a successful scan) while play() is still pending,
 * the browser rejects it with this AbortError — benign, but Next's dev
 * overlay treats the unhandled rejection as a fatal error. Swallow only this
 * specific, known rejection while the scanner is mounted. (Same fix Map
 * Advisor Functional and Map Achievement Functional both needed for the same
 * library — carried forward rather than re-discovered.)
 */
function isBenignPlayAbort(reason: unknown): boolean {
  return (
    reason instanceof DOMException && reason.name === "AbortError" && reason.message.includes("play() request was interrupted")
  );
}

/** scanner.stop() throws *synchronously* (not a rejected promise) when the scanner isn't currently running, so a chained .catch() alone can't guard it. */
function safeStop(scanner: Html5Qrcode) {
  try {
    scanner
      .stop()
      .catch(() => {})
      .finally(() => {
        try {
          scanner.clear();
        } catch {
          // ignore
        }
      });
  } catch {
    try {
      scanner.clear();
    } catch {
      // ignore
    }
  }
}

/**
 * The one QR-scanning implementation in Atlas — request camera permission,
 * decode a QR code, hand the raw decoded text back to the caller. Never
 * decides whether the scanned text is valid itself; that's always a server
 * decision (see services/advisor/check-in-qr.ts). Reusable across any future
 * QR flow (Place check-in now; hotel onboarding already has its own
 * token-paste path and doesn't need this).
 */
export function QrScannerModal({ onClose, onScan }: { onClose: () => void; onScan: (decodedText: string) => void }) {
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isBenignPlayAbort(event.reason)) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    const scanner = new Html5Qrcode(REGION_ID);
    let stopped = false;
    let running = false;

    const stopIfRunning = () => {
      if (running) {
        running = false;
        safeStop(scanner);
      }
    };

    const startPromise = scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 250 },
        (decodedText) => {
          if (stopped) return;
          stopped = true;
          stopIfRunning();
          onScanRef.current(decodedText);
        },
        () => {}
      )
      .then(() => {
        running = true;
        if (stopped) stopIfRunning();
      })
      .catch((err: unknown) => {
        console.error("Unable to start camera for QR scanning", err);
      });

    return () => {
      stopped = true;
      startPromise.finally(() => {
        stopIfRunning();
        setTimeout(() => {
          window.removeEventListener("unhandledrejection", handleUnhandledRejection);
        }, 1000);
      });
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Scan a Place QR code</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-900" aria-label="Close scanner">
            ✕
          </button>
        </div>
        <div id={REGION_ID} className="overflow-hidden rounded-xl" />
        <p className="mt-3 text-center text-xs text-slate-500">Point your camera at the QR code at this stop.</p>
      </div>
    </div>
  );
}
