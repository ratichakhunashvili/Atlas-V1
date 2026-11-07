import "server-only";
import { del, head, put } from "@vercel/blob";
import type { StorageService } from "./index";

/**
 * Vercel Blob behind the StorageService interface. Files are public (a guest's browser downloads a model straight
 * onto the map); writes and deletes need the store's read-write token, which only the server holds.
 *
 * Each upload gets a random suffix, so a replaced model gets a new URL and no phone keeps a cached old file.
 */
export function createVercelBlobStorage(token: string): StorageService {
  return {
    configured: true,

    async upload(input) {
      try {
        const blob = await put(input.key, input.data instanceof Uint8Array ? Buffer.from(input.data) : input.data, {
          access: "public",
          contentType: input.contentType,
          addRandomSuffix: true,
          token,
        });
        return { ok: true, key: blob.pathname, url: blob.url };
      } catch (error) {
        console.error("[storage] upload failed", error instanceof Error ? error.message : error);
        return { ok: false, reason: "failed", message: "The file couldn't be stored. Try again." };
      }
    },

    async delete(key) {
      try {
        await del(key, { token });
        return { ok: true };
      } catch (error) {
        console.error("[storage] delete failed", error instanceof Error ? error.message : error);
        return { ok: false, message: "The stored file couldn't be removed." };
      }
    },

    async inspect(url) {
      try {
        // head() answers only for files in THIS store (it is authenticated with our token), so a URL from anywhere
        // else is refused here even if it looks right.
        const meta = await head(url, { token });
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
