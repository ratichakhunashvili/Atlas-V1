"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/shared/button";
import {
  NoFrameError,
  startCamera,
  stopCamera,
  settleCameraStart,
  hashFromVideoFrame,
  type CameraFailure,
} from "./capture";

/**
 * The guest's camera, for one capture.
 *
 * **The photograph never exists as a file.** The video element shows a live
 * stream; pressing the button reduces one frame to a hash, and that hash is the
 * only thing that leaves this component. No image is saved or uploaded.
 *
 * The camera is released on every exit path — success, failure, cancel and
 * unmount — because a camera light still on after the guest has walked away
 * looks exactly like an app that is watching them.
 */
export function ArCaptureModal({
  placeName,
  onCapture,
  onClose,
  onCameraFailure,
  pending,
}: {
  placeName: string;
  /** Receives 60 hex characters. Never an image. */
  onCapture: (captureHash: string) => void;
  onClose: () => void;
  onCameraFailure: (failure: CameraFailure) => void;
  pending: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<"starting" | "ready" | "failed">("starting");
  const [localError, setLocalError] = useState<string | null>(null);

  const release = useCallback(() => {
    stopCamera(streamRef.current);
    streamRef.current = null;
  }, []);

  /*
   * The failure callback is held in a ref so the effect below can run exactly
   * ONCE. The parent passes a new inline arrow on every render, and it re-renders
   * while this modal is open (the `pending` transition alone does it). An effect
   * that depended on the callback would therefore tear the stream down and call
   * getUserMedia again on each of those renders — visible flicker, and on some
   * browsers a repeated permission prompt.
   */
  const onCameraFailureRef = useRef(onCameraFailure);
  useEffect(() => {
    onCameraFailureRef.current = onCameraFailure;
  }, [onCameraFailure]);

  useEffect(() => {
    // Guards against a stream arriving after the guest has already closed the
    // modal: without it, getUserMedia resolves into an unmounted component and
    // the camera stays on with nothing showing it.
    let cancelled = false;

    void startCamera().then((result) => {
      settleCameraStart(
        result,
        cancelled,
        (stream) => {
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            void videoRef.current.play().catch(() => {
              // Autoplay refusal is not a camera failure: the stream is live and the
              // first frame is still readable, so this is deliberately not fatal.
            });
          }
          setStatus("ready");
        },
        (failure) => {
          setStatus("failed");
          onCameraFailureRef.current(failure);
        }
      );
    });

    return () => {
      cancelled = true;
      release();
    };
    // Deliberately empty: the camera is opened once, for the life of the modal.
    // `release` is stable and the failure callback is read through a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function capture() {
    const video = videoRef.current;
    if (!video) return;

    try {
      const hash = hashFromVideoFrame(video);
      // Released before the result comes back: the capture is done, so there is
      // no reason to keep the camera open while the server decides.
      release();
      onCapture(hash);
    } catch (error) {
      setLocalError(
        error instanceof NoFrameError
          ? "The camera hasn't warmed up yet — give it a second and try again."
          : "We couldn't read that frame. Try again."
      );
    }
  }

  function cancel() {
    release();
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/90 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Point your camera at ${placeName}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-white">Point your camera at {placeName}</p>
          <p className="mt-1 text-xs text-white/70">
            Line the building up inside the square. No image is saved or uploaded — your phone works
            out the match and sends only the result.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={cancel}>
          Cancel
        </Button>
      </div>

      <div className="relative mt-4 flex-1 overflow-hidden rounded-lg bg-black">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          playsInline
          muted
          // Mirroring would flip the frame relative to the stored reference.
          autoPlay
        />
        {/* The square the hash is actually taken from, so the guest aims at the right thing. */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="aspect-square w-4/5 max-w-sm rounded-lg border-2 border-white/80" />
        </div>
        {status === "starting" && (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
            Starting the camera…
          </p>
        )}
      </div>

      {localError && <p className="mt-3 text-sm text-amber-300">{localError}</p>}

      <div className="mt-4 flex justify-center">
        <Button type="button" disabled={status !== "ready" || pending} onClick={capture}>
          {pending ? "Checking…" : "Capture"}
        </Button>
      </div>
    </div>
  );
}
