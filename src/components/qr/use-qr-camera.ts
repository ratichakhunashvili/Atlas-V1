"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { qrCameraProblem, type QrCameraProblem } from "./camera-problem";

/*
 * The one camera + QR decoder in Atlas. Renders the camera into the element with `regionId`, reads QR codes and
 * hands the raw text back exactly once per run. It never decides whether a code is valid — that is always the
 * server's job (services/advisor/check-in-qr.ts, features/hotel-stays/actions.ts).
 *
 * After a read the camera stops and stays stopped until the caller calls `restart()`: restarting by itself would
 * re-read the same bad code ten times a second and use up the guest's check-in attempts.
 */

export type QrCameraState = "idle" | "starting" | "scanning" | "paused" | QrCameraProblem;

export type QrTorch = { supported: boolean; on: boolean; toggle: () => void };

/**
 * html5-qrcode calls its camera <video>'s .play() without handling the promise. If the element is torn down while
 * play() is pending (e.g. right after a successful scan) the browser rejects with this AbortError — harmless, but
 * Next's dev overlay treats the unhandled rejection as fatal. Only this specific rejection is swallowed.
 */
function isBenignPlayAbort(reason: unknown): boolean {
  return reason instanceof DOMException && reason.name === "AbortError" && reason.message.includes("play() request was interrupted");
}

/** scanner.stop() throws synchronously (not a rejected promise) when the scanner isn't running. */
function safeStop(scanner: Html5Qrcode) {
  const clear = () => {
    try {
      scanner.clear();
    } catch {
      // Already cleared.
    }
  };
  try {
    scanner.stop().catch(() => {}).finally(clear);
  } catch {
    clear();
  }
}

/**
 * Scales a run's video up (never stretching it) until it covers the camera frame. A CSS transform leaves the
 * video's layout box — which the reader uses to map pixels — at the camera's true shape.
 */
function coverRegion(region: HTMLElement, host: HTMLElement) {
  const video = host.querySelector("video");
  if (!video || !video.clientHeight) return;
  const scale = Math.max(1, region.clientHeight / video.clientHeight);
  host.style.transform = `translateY(-50%) scale(${scale})`;
}

export function useQrCamera({ regionId, onDecode, autoStart = true }: { regionId: string; onDecode: (text: string) => void; autoStart?: boolean }) {
  const onDecodeRef = useRef(onDecode);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [attempt, setAttempt] = useState(autoStart ? 1 : 0);
  const [state, setState] = useState<QrCameraState>(autoStart ? "starting" : "idle");
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  useEffect(() => {
    onDecodeRef.current = onDecode;
  });

  useEffect(() => {
    if (attempt === 0) return;
    // getUserMedia only exists on secure pages (https or localhost); on a phone opening http://<LAN address> it's missing.
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reporting a browser capability found on mount
      setState("insecure");
      return;
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isBenignPlayAbort(event.reason)) event.preventDefault();
    };
    let done = false;
    let running = false;
    let scanner: Html5Qrcode | null = null;
    let host: HTMLDivElement | null = null;
    let startPromise: Promise<void> = Promise.resolve();
    let resizeObserver: ResizeObserver | null = null;
    const stopIfRunning = () => {
      if (!running || !scanner) return;
      running = false;
      safeStop(scanner);
    };

    // Started one tick later, so a run that is torn down at once (React's development double-mount) never opens
    // the camera at all.
    const timer = window.setTimeout(() => {
      // Each run renders into its own child element, so tearing one run down never clears the next run's video.
      const region = document.getElementById(regionId);
      if (done || !region) return;
      window.addEventListener("unhandledrejection", handleUnhandledRejection);
      const runHost = document.createElement("div");
      runHost.id = `${regionId}-run-${attempt}-${Math.random().toString(36).slice(2, 8)}`;
      region.appendChild(runHost);
      host = runHost;

      const run = new Html5Qrcode(runHost.id, {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        useBarCodeDetectorIfSupported: true,
      });
      scanner = run;
      scannerRef.current = run;

      startPromise = run
        .start(
          { facingMode: "environment" },
          { fps: 10, disableFlip: true },
          (decodedText) => {
            if (done) return;
            done = true;
            stopIfRunning();
            setTorchOn(false);
            setState("paused");
            onDecodeRef.current(decodedText);
          },
          () => {}
        )
        .then(() => {
          running = true;
          if (done) return stopIfRunning();
          coverRegion(region, runHost);
          resizeObserver = new ResizeObserver(() => coverRegion(region, runHost));
          resizeObserver.observe(region);
          setState("scanning");
          try {
            setTorchSupported(run.getRunningTrackCameraCapabilities().torchFeature().isSupported());
          } catch {
            setTorchSupported(false);
          }
        })
        .catch((err: unknown) => {
          try {
            run.clear();
          } catch {
            // The rest of the screen still works if cleanup fails.
          }
          if (!done) setState(qrCameraProblem(err));
        });
    }, 0);

    return () => {
      done = true;
      window.clearTimeout(timer);
      resizeObserver?.disconnect();
      scannerRef.current = null;
      startPromise.finally(() => {
        stopIfRunning();
        setTimeout(() => {
          window.removeEventListener("unhandledrejection", handleUnhandledRejection);
          host?.remove();
        }, 1000);
      });
    };
  }, [attempt, regionId]);

  // "starting" is set here, before the effect runs, so the camera element is already visible (and measurable)
  // when the library attaches its video to it.
  const restart = useCallback(() => {
    setState("starting");
    setTorchSupported(false);
    setTorchOn(false);
    setAttempt((n) => n + 1);
  }, []);

  const toggleTorch = useCallback(() => {
    const scanner = scannerRef.current;
    if (!scanner || !torchSupported) return;
    const next = !torchOn;
    scanner
      .getRunningTrackCameraCapabilities()
      .torchFeature()
      .apply(next)
      .then(() => setTorchOn(next))
      .catch(() => setTorchSupported(false));
  }, [torchOn, torchSupported]);

  const torch: QrTorch = { supported: torchSupported && state === "scanning", on: torchOn, toggle: toggleTorch };
  return { state, restart, torch };
}

export const CAMERA_PROBLEM_COPY: Record<QrCameraProblem, string> = {
  denied: "Camera access is off. Allow it for this site in your browser settings, or use the options below.",
  no_camera: "We couldn't find a camera on this device. Use the options below instead.",
  busy: "Another app is using the camera. Close it and try again.",
  insecure: "The camera only works on a secure (https) page. Open Atlas from its normal address and try again.",
  failed: "We couldn't start the camera. Try again, or use the options below.",
};
