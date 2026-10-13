export type StorageService = {
  upload(file: File, path: string): Promise<string>;
  delete(path: string): Promise<void>;
  getUrl(path: string): string;
};

// No local filesystem persistence (the app targets Vercel's read-only/
// ephemeral filesystem). Wire this up to Vercel Blob or an equivalent
// object store before any feature needs file uploads.
export const storageService: StorageService = {
  async upload() {
    throw new Error("storageService.upload is not implemented yet.");
  },
  async delete() {
    throw new Error("storageService.delete is not implemented yet.");
  },
  getUrl() {
    throw new Error("storageService.getUrl is not implemented yet.");
  },
};
