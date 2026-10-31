/**
 * File storage, as an interface the rest of Atlas depends on rather than a
 * specific vendor.
 *
 * **No object store is configured in this project.** `@vercel/blob` is approved
 * but not installed, and no credentials exist. That is a fact the product has to
 * handle, not hide: an upload form that silently fails, or worse reports success
 * and stores a row pointing at nothing, is the failure mode this interface exists
 * to prevent.
 *
 * So the default implementation reports `configured: false` and refuses, with a
 * message an admin can act on. Callers must check the result; they are given no
 * way to mistake "not configured" for "uploaded".
 */

export type StorageUploadInput = {
  /** Bytes to store. */
  data: ArrayBuffer | Uint8Array;
  /** Where to put it, relative to the store's root. */
  key: string;
  contentType: string;
};

export type StorageUploadResult =
  | { ok: true; key: string; url: string }
  | { ok: false; reason: "not_configured" | "rejected" | "failed"; message: string };

export type StorageService = {
  /** Whether a real store is wired up. False in this project today. */
  readonly configured: boolean;
  upload(input: StorageUploadInput): Promise<StorageUploadResult>;
  delete(key: string): Promise<{ ok: boolean; message?: string }>;
};

/** What an admin is told when no store is configured. Names the missing thing rather than blaming them. */
export const STORAGE_NOT_CONFIGURED_MESSAGE =
  "File storage isn't configured for this deployment, so the model can't be uploaded. An administrator needs to connect an object store (for example Vercel Blob) and set its credentials.";

/**
 * The default: honest refusal.
 *
 * Deliberately NOT a silent no-op and not a thrown error. A no-op would let a
 * model row be written pointing at a file that does not exist; an exception would
 * surface as a 500 that tells an admin nothing about what to fix.
 */
export const unconfiguredStorage: StorageService = {
  configured: false,

  async upload() {
    return { ok: false, reason: "not_configured", message: STORAGE_NOT_CONFIGURED_MESSAGE };
  },

  async delete() {
    return { ok: false, message: STORAGE_NOT_CONFIGURED_MESSAGE };
  },
};

/**
 * The storage the application uses.
 *
 * When Vercel Blob (or another store) is configured, this is where its
 * implementation is wired in — the shape above is all the rest of Atlas depends
 * on, so nothing else changes. Until then every caller gets the refusal above.
 */
export const storageService: StorageService = unconfiguredStorage;

/**
 * An in-memory store for tests.
 *
 * Exercises the real upload path — validation, keying, the model row, the error
 * handling — without a network or credentials. **Using it proves the code around
 * storage works; it proves nothing about a real Blob upload**, which remains
 * unexercised until credentials exist.
 */
export function createFakeStorage(options: { failWith?: StorageUploadResult } = {}): StorageService & {
  readonly files: Map<string, { contentType: string; size: number }>;
} {
  const files = new Map<string, { contentType: string; size: number }>();

  return {
    configured: true,
    files,

    async upload(input) {
      if (options.failWith) return options.failWith;

      const size = input.data instanceof Uint8Array ? input.data.byteLength : input.data.byteLength;
      files.set(input.key, { contentType: input.contentType, size });

      return { ok: true, key: input.key, url: `https://test-storage.invalid/${input.key}` };
    },

    async delete(key) {
      files.delete(key);
      return { ok: true };
    },
  };
}
