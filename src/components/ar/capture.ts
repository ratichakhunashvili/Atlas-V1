import { hashFromGreyscale } from "@/services/ar/hash";
import { DOWNSCALE_SIZE, centredSquare, greyscaleGrid } from "@/services/ar/greyscale";

/**
 * Browser-side capture: camera frame or chosen file in, 60 hex characters out.
 *
 * **Nothing leaves this module except the hash.** The pixels live in a canvas on
 * the stack for the duration of one function call; no blob is created, nothing is
 * uploaded, nothing is written to storage, and no image is put in React state
 * where a devtools inspection or an error report could capture it. The canvas is
 * sized to 128×128 before anything is read back from it. The temporary pixel
 * buffer is reduced immediately to a hash and cleared; no image or pixel buffer
 * is uploaded or stored.
 *
 * Both the admin (reference image) and the guest (camera frame) go through the
 * same two functions, so the two sides cannot drift apart in how they reduce an
 * image.
 */

/** Why a camera could not be used. Each gets its own honest message in the UI. */
export type CameraFailure =
  /** The guest said no, or the browser remembers an earlier no. */
  | "permission_denied"
  /** No camera on this device. */
  | "no_camera"
  /** Another application holds the camera, or the hardware failed.	*/
  | "camera_unavailable"
  /** getUserMedia does not exist — an old browser, or a page not served over HTTPS. */
  | "unsupported"
  /** Anything else, reported rather than swallowed. */
  | "unknown";

export type CameraResult = { ok: true; stream: MediaStream } | { ok: false; failure: CameraFailure };

/**
 * Handles the race where getUserMedia resolves after the modal was cancelled.
 * Late streams are stopped immediately, before they can keep the camera active.
 */
export function settleCameraStart(
  result: CameraResult,
  cancelled: boolean,
  onReady: (stream: MediaStream) => void,
  onFailure: (failure: CameraFailure) => void
): void {
  if (cancelled) {
    if (result.ok) stopCamera(result.stream);
    return;
  }

  if (result.ok) onReady(result.stream);
  else onFailure(result.failure);
}

/**
 * Asks for the rear camera and reports precisely why if it cannot have it.
 *
 * `facingMode: "environment"` is a preference, not a requirement: a laptop with
 * only a front camera should still work rather than failing outright, so this is
 * deliberately not an `exact` constraint.
 */
export async function startCamera(): Promise<CameraResult> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    // Also the honest answer on plain HTTP: the API is genuinely absent there.
    return { ok: false, failure: "unsupported" };
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
    return { ok: true, stream };
  } catch (error) {
    return { ok: false, failure: classifyCameraError(error) };
  }
}

/** Maps the DOMException names getUserMedia actually throws onto our own cases. */
export function classifyCameraError(error: unknown): CameraFailure {
  const name = error instanceof Error ? error.name : "";

  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "permission_denied";
    case "NotFoundError":
    case "OverconstrainedError":
      return "no_camera";
    case "NotReadableError":
    case "AbortError":
      return "camera_unavailable";
    default:
      return "unknown";
  }
}

/**
 * Releases the camera.
 *
 * Called on cancel, on unmount and after a successful capture alike. Forgetting
 * this leaves the phone's camera light on after the guest has moved on, which
 * reads as the app watching them — so it is a correctness requirement, not
 * tidiness.
 */
export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Thrown when there is nothing to hash yet (a video that has not produced a frame). */
export class NoFrameError extends Error {
  constructor() {
    super("The camera has not produced a frame yet");
    this.name = "NoFrameError";
  }
}

/**
 * Hashes the centred square of whatever is currently on screen in `video`.
 * It first downsizes to 128×128, then averages into the 16×16 grid used by dHash.
 */
export function hashFromVideoFrame(video: HTMLVideoElement): string {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new NoFrameError();

  return hashFromDrawable(video, width, height);
}

/**
 * Hashes an image file the admin chose. Used only to produce a reference hash;
 * the file itself is never read by, sent to, or stored on the server.
 */
export async function hashFromImageFile(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    if (!image.naturalWidth || !image.naturalHeight) throw new NoFrameError();
    return hashFromDrawable(image, image.naturalWidth, image.naturalHeight);
  } finally {
    // Revoked whether the hash succeeded or threw: an object URL left alive is a
    // handle to the image that outlives the function that made it.
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("That file could not be read as an image"));
    image.src = url;
  });
}

function hashFromDrawable(source: CanvasImageSource, width: number, height: number): string {
  const square = centredSquare(width, height);

  /*
   * Two-step reduction, deliberately. The browser takes the frame down to
   * DOWNSCALE_SIZE — a gentle enough ratio that its filter behaves — and
   * greyscaleGrid does the final 128 -> 16 box-average in code that is tested.
   * Drawing straight into 16x16 would hand the whole reduction to an untested
   * filter at a ratio where it aliases, and the hash would depend on sampling
   * artefacts rather than on the scene.
   */
  const canvas = document.createElement("canvas");
  canvas.width = DOWNSCALE_SIZE;
  canvas.height = DOWNSCALE_SIZE;

  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("This browser cannot process the image");

  // Ask for the better filter where it is available; the averaging below means a
  // browser that ignores this still produces a usable hash.
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";

  try {
    context.drawImage(source, square.x, square.y, square.size, square.size, 0, 0, DOWNSCALE_SIZE, DOWNSCALE_SIZE);
    const { data } = context.getImageData(0, 0, DOWNSCALE_SIZE, DOWNSCALE_SIZE);
    return hashFromGreyscale(greyscaleGrid(data, DOWNSCALE_SIZE, DOWNSCALE_SIZE));
  } finally {
    // Clear even if drawing, pixel reads, conversion or hashing throws.
    context.clearRect(0, 0, DOWNSCALE_SIZE, DOWNSCALE_SIZE);
    canvas.width = 0;
    canvas.height = 0;
  }
}
