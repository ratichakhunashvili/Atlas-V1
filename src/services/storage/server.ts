import "server-only";
import { unconfiguredStorage, type StorageService } from "./index";
import { createVercelBlobStorage } from "./vercel-blob";

/**
 * The storage the application uses: Vercel Blob when a Blob store is connected to the project (Vercel then sets
 * BLOB_READ_WRITE_TOKEN on its own), otherwise the honest refusal. The token stays on the server.
 */
const token = process.env.BLOB_READ_WRITE_TOKEN;

export const storageService: StorageService = token ? createVercelBlobStorage(token) : unconfiguredStorage;
