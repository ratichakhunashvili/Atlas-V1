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

/** 25 MB. Large enough for a detailed landmark, small enough that a phone on hotel wifi can load it. */
export const MAX_MODEL_BYTES = 25 * 1024 * 1024;

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
  if (input.bytes.byteLength === 0) {
    return { ok: false, reason: "empty", message: "That file is empty." };
  }

  if (input.bytes.byteLength > MAX_MODEL_BYTES) {
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

  const startsWithGlb = GLB_MAGIC.every((byte, index) => input.bytes[index] === byte);
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
