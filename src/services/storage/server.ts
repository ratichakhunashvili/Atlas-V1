import "server-only";
import { unconfiguredStorage, type StorageService } from "./index";
import { createVercelBlobStorage } from "./vercel-blob";

/**
 * The storage the application uses: Vercel Blob when a Blob store is connected to the project, otherwise the honest
 * refusal. Vercel sets the connection itself: BLOB_STORE_ID (the store authenticates this deployment with Vercel
 * OIDC, no long-lived secret) or, for older stores, BLOB_READ_WRITE_TOKEN. Neither ever reaches the browser.
 */
export const isBlobConfigured = Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

export const storageService: StorageService = isBlobConfigured ? createVercelBlobStorage() : unconfiguredStorage;
