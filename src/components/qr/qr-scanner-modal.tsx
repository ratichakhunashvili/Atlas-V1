"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
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
 * decision (see services/advisor/check-in-qr.ts). Reusable for hotel entry and
 * Place check-in; the caller chooses the server workflow for the token purpose.
 */
export function QrScannerModal({
  onClose,
  onScan,
  title = "Scan a Place QR code",
  description = "Point your camera at the QR code at this stop, or enter its code below.",
}: {
  onClose: () => void;
  onScan: (decodedText: string) => void;
  title?: string;
  description?: string;
}) {
  const onScanRef = useRef(onScan);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const cameraRequested = cameraAttempt > 0;
  useEffect(() => {
    onScanRef.current = onScan;
  });

  useEffect(() => {
    if (cameraAttempt === 0) return;
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
        const message = err instanceof Error ? err.message : "Camera access is unavailable.";
        try {
          scanner.clear();
        } catch {
          // The manual code field remains available if scanner cleanup fails.
        }
        setCameraError(message.toLowerCase().includes("permission")
          ? "Camera access was denied. Enter the code manually or allow camera access in your browser settings."
          : "Could not start the camera. Enter the code manually or try again.");
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
  }, [cameraAttempt]);

  function submitManualCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = manualCode.trim();
    if (code) onScanRef.current(code);
  }

  return (
    <div className="atlas-qr-backdrop" role="presentation">
      <div className="atlas-qr-dialog" role="dialog" aria-modal="true" aria-labelledby="atlas-qr-title">
        <div className="atlas-qr-heading">
          <div>
            <p className="atlas-eyebrow">Atlas scanner</p>
            <h2 id="atlas-qr-title">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="atlas-panel-close" aria-label="Close scanner">
            ✕
          </button>
        </div>
        <p className="atlas-panel-copy">{description}</p>
        {cameraRequested && <div id={REGION_ID} className="atlas-qr-camera" />}
        {cameraError && <p className="atlas-qr-error" role="status">{cameraError}</p>}
        {!cameraRequested || cameraError ? (
          <button
            type="button"
            className="atlas-secondary-action"
            onClick={() => {
              setCameraError(null);
              setCameraAttempt((attempt) => attempt + 1);
            }}
          >
            {cameraError ? "Try camera again" : "Start camera"}
          </button>
        ) : (
          <p className="atlas-qr-hint">Point your camera at the QR code.</p>
        )}
        <form className="atlas-qr-manual" onSubmit={submitManualCode}>
          <label htmlFor="atlas-qr-manual-code">Or enter a code</label>
          <div>
            <input
              id="atlas-qr-manual-code"
              value={manualCode}
              onChange={(event) => setManualCode(event.target.value)}
              autoComplete="off"
              required
              placeholder="Enter QR code"
            />
            <button type="submit" className="atlas-primary-action">Continue</button>
          </div>
        </form>
      </div>
    </div>
  );
}
