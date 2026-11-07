/**
 * File storage, as an interface the rest of Atlas depends on rather than a
 * specific vendor.
 *
 * A deployment may have no object store connected (no `BLOB_READ_WRITE_TOKEN`).
 * That is a fact the product has to handle, not hide: an upload form that
 * silently fails, or worse reports success and stores a row pointing at nothing,
 * is the failure mode this interface exists to prevent.
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
  /** Whether a real store is wired up. */
  readonly configured: boolean;
  upload(input: StorageUploadInput): Promise<StorageUploadResult>;
  delete(key: string): Promise<{ ok: boolean; message?: string }>;
  /**
   * What the store itself records about a file the browser uploaded directly: null when the URL is not a file in
   * this store. Used to check a direct upload before any database row points at it.
   */
  inspect(url: string): Promise<StoredFile | null>;
};

export type StoredFile = { key: string; url: string; size: number; contentType: string; firstBytes: Uint8Array };

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

  async inspect() {
    return null;
  },
};

/*
 * The storage the application actually uses is chosen in ./server.ts (server-only): Vercel Blob when the project has
 * a Blob store connected, otherwise the refusal above. This file stays free of the SDK so tests can import it.
 */

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

    async inspect(url) {
      const key = url.replace("https://test-storage.invalid/", "");
      const file = files.get(key);
      return file ? { key, url, size: file.size, contentType: file.contentType, firstBytes: new Uint8Array([0x67, 0x6c, 0x54, 0x46]) } : null;
    },
  };
}
