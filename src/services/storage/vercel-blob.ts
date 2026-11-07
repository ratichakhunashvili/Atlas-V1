import "server-only";
import { del, head, put } from "@vercel/blob";
import type { StorageService } from "./index";

/**
 * Vercel Blob behind the StorageService interface. Files are public (a guest's browser downloads a model straight
 * onto the map); writes and deletes are authenticated on the server by the SDK itself (Vercel OIDC with
 * BLOB_STORE_ID, or BLOB_READ_WRITE_TOKEN for older stores).
 *
 * Each upload gets a random suffix, so a replaced model gets a new URL and no phone keeps a cached old file.
 */
export function createVercelBlobStorage(): StorageService {
  return {
    configured: true,

    async upload(input) {
      try {
        const blob = await put(input.key, input.data instanceof Uint8Array ? Buffer.from(input.data) : input.data, {
          access: "public",
          contentType: input.contentType,
          addRandomSuffix: true,
        });
        return { ok: true, key: blob.pathname, url: blob.url };
      } catch (error) {
        console.error("[storage] upload failed", error instanceof Error ? error.message : error);
        return { ok: false, reason: "failed", message: "The file couldn't be stored. Try again." };
      }
    },

    async delete(key) {
      try {
        await del(key);
        return { ok: true };
      } catch (error) {
        console.error("[storage] delete failed", error instanceof Error ? error.message : error);
        return { ok: false, message: "The stored file couldn't be removed." };
      }
    },

    async inspect(url) {
      try {
        // head() answers only for files in THIS store (it is authenticated as this deployment), so a URL from anywhere
        // else is refused here even if it looks right.
        const meta = await head(url);
        const response = await fetch(meta.url, { headers: { Range: "bytes=0-3" }, cache: "no-store" });
        if (!response.ok) return null;
        const firstBytes = new Uint8Array(await response.arrayBuffer()).subarray(0, 4);
        return { key: meta.pathname, url: meta.url, size: meta.size, contentType: meta.contentType, firstBytes };
      } catch {
        return null;
      }
    },
  };
}
