import type { StorageService, StorageUploadResult } from "@/services/storage";

/**
 * Validating a model file before it is stored.
 *
 * Pure, so every rule is testable without a store or a browser. Nothing here
 * parses or executes the file — a GLB is handed to the browser's loader, never to
 * the server — so validation is about shape, type and size.
 */

/** Binary glTF. The only format the client loader reads. */
export const ALLOWED_MODEL_CONTENT_TYPES = ["model/gltf-binary"] as const;

/** 50 MB. Room for a detailed landmark; compress models (Draco/Meshopt, smaller textures) so phones load them quickly. */
export const MAX_MODEL_BYTES = 50 * 1024 * 1024;

/** The first four bytes of every GLB file: "glTF". */
const GLB_MAGIC = [0x67, 0x6c, 0x54, 0x46];

export type ModelValidationFailure =
  | "empty"
  | "too_large"
  | "wrong_content_type"
  | "not_a_glb";

export type ModelValidation = { ok: true } | { ok: false; reason: ModelValidationFailure; message: string };

/**
 * Checks a candidate model file.
 *
 * The magic-number check matters more than the content type: a browser will send
 * whatever type it likes, and an admin renaming `something.exe` to `.glb` should
 * not get it into the object store. Reading four bytes is not a security boundary
 * on its own, but it stops the file that is obviously not a model.
 */
export function validateModelFile(input: {
  bytes: Uint8Array;
  contentType: string;
}): ModelValidation {
  return validateModelShape({ size: input.bytes.byteLength, contentType: input.contentType, firstBytes: input.bytes });
}

/**
 * The checks themselves, on what is known about a file without holding all of it: its size, its declared type and
 * its first bytes. A direct upload is judged this way after it lands, from the store's own record and a 4-byte read.
 */
export function validateModelShape(input: { size: number; contentType: string; firstBytes: Uint8Array }): ModelValidation {
  if (input.size === 0) {
    return { ok: false, reason: "empty", message: "That file is empty." };
  }

  if (input.size > MAX_MODEL_BYTES) {
    const megabytes = Math.round(MAX_MODEL_BYTES / (1024 * 1024));
    return {
      ok: false,
      reason: "too_large",
      message: `Models must be ${megabytes} MB or smaller so they load on a phone.`,
    };
  }

  if (!(ALLOWED_MODEL_CONTENT_TYPES as readonly string[]).includes(input.contentType)) {
    return {
      ok: false,
      reason: "wrong_content_type",
      message: "Upload a binary glTF file (.glb).",
    };
  }

  const startsWithGlb = GLB_MAGIC.every((byte, index) => input.firstBytes[index] === byte);
  if (!startsWithGlb) {
    return {
      ok: false,
      reason: "not_a_glb",
      message: "That file isn't a binary glTF (.glb) model, whatever it is named.",
    };
  }

  return { ok: true };
}

/**
 * Where a Place's model lives in the store.
 *
 * Keyed by Place id, so re-uploading replaces rather than accumulating, and the
 * key reveals nothing about who uploaded it or when.
 */
export function modelStorageKey(placeId: string): string {
  return `place-models/${placeId}.glb`;
}

/**
 * Whether a URL the browser reports after a direct upload is really this Place's model in Atlas's own Blob store.
 *
 * The browser uploads straight to the store (Vercel rejects function bodies over 4.5 MB), then tells the server the
 * URL it got. That URL is a client claim: it must be an https URL on Vercel Blob's public host and sit under this
 * Place's own model path, or the server refuses to attach it — an admin form must not be able to point a model at
 * an arbitrary site, or at another Place's file. (The store then confirms the file is its own; see the storage
 * service's `inspect`.)
 */
export function isOwnModelUrl(url: string, placeId: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "https:" &&
    parsed.hostname.endsWith(".public.blob.vercel-storage.com") &&
    parsed.search === "" &&
    parsed.pathname.startsWith(`/place-models/${placeId}`) &&
    parsed.pathname.endsWith(".glb")
  );
}

/**
 * Validates and stores, returning the storage result unchanged on failure.
 *
 * The storage service is injected so tests exercise this exact path with a fake,
 * and so an unconfigured deployment refuses honestly instead of writing a model
 * row that points at nothing.
 */
export async function uploadModelFile(
  storage: StorageService,
  input: { placeId: string; bytes: Uint8Array; contentType: string }
): Promise<StorageUploadResult | { ok: false; reason: ModelValidationFailure; message: string }> {
  const validation = validateModelFile({ bytes: input.bytes, contentType: input.contentType });
  if (!validation.ok) return validation;

  return storage.upload({
    data: input.bytes,
    key: modelStorageKey(input.placeId),
    contentType: input.contentType,
  });
}
