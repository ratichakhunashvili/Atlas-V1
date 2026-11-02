import { classifyCameraError, type CameraFailure } from "@/components/ar/capture";

/** Why the QR camera isn't showing a picture, in the scanner's own words. */
export type QrCameraProblem = "denied" | "no_camera" | "busy" | "insecure" | "failed";

const FROM_FAILURE: Record<CameraFailure, QrCameraProblem> = {
  permission_denied: "denied",
  no_camera: "no_camera",
  camera_unavailable: "busy",
  unsupported: "insecure",
  unknown: "failed",
};

/**
 * html5-qrcode rejects with an Error, a DOMException or a plain string such as "NotAllowedError: Permission
 * denied" depending on the browser. Strings are turned back into a named error so the one camera-error rule
 * (components/ar/capture.ts) classifies every case.
 */
export function qrCameraProblem(error: unknown): QrCameraProblem {
  if (typeof error === "string") {
    const named = new Error(error);
    named.name = error.match(/\b([A-Z][A-Za-z]*Error)\b/)?.[1] ?? "Error";
    return FROM_FAILURE[classifyCameraError(named)];
  }
  return FROM_FAILURE[classifyCameraError(error)];
}
