"use client";

import { useState, type FormEvent } from "react";
import { CAMERA_PROBLEM_COPY, useQrCamera } from "./use-qr-camera";

const REGION_ID = "atlas-qr-scanner-region";

/**
 * The scanner as a dialog (My plan's "Scan the QR code"). The camera and decoding are the shared useQrCamera; this
 * only adds the dialog, a flash toggle and the typed-code fallback. It never decides whether the scanned text is
 * valid — that's always a server decision. Reusable for hotel entry and Place check-in; the caller chooses the
 * server workflow for the token purpose.
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
  const [manualCode, setManualCode] = useState("");
  const { state, restart, torch } = useQrCamera({ regionId: REGION_ID, onDecode: onScan, autoStart: false });
  const cameraProblem = state in CAMERA_PROBLEM_COPY ? CAMERA_PROBLEM_COPY[state as keyof typeof CAMERA_PROBLEM_COPY] : null;
  const cameraShown = state === "starting" || state === "scanning";

  function submitManualCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = manualCode.trim();
    if (code) onScan(code);
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
        {/* Always mounted so the library can find it; hidden while the camera is off. */}
        <div id={REGION_ID} className="atlas-qr-camera" hidden={!cameraShown} />
        {cameraProblem && <p className="atlas-qr-error" role="status">{cameraProblem}</p>}
        {cameraShown ? (
          <div className="atlas-qr-hint flex items-center justify-between gap-[8px]">
            <span>{state === "starting" ? "Starting the camera…" : "Point your camera at the QR code."}</span>
            {torch.supported ? (
              <button type="button" aria-pressed={torch.on} onClick={torch.toggle} className="atlas-secondary-action">
                {torch.on ? "Flash off" : "Flash on"}
              </button>
            ) : null}
          </div>
        ) : (
          <button type="button" className="atlas-secondary-action" onClick={restart}>
            {cameraProblem ? "Try camera again" : "Start camera"}
          </button>
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
