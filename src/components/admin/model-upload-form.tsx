"use client";

import { uploadPresigned } from "@vercel/blob/client";
import { useState } from "react";
import { Button } from "@/components/shared/button";
import { Select } from "@/components/shared/select";
import { attachUploadedModelAction } from "@/features/place-models/actions";

/** Above this, the file goes up in parallel parts, which is faster and retries a failed part instead of the whole file. */
const MULTIPART_FROM_BYTES = 8 * 1024 * 1024;

/**
 * Uploads a model straight from the admin's browser to the store, then asks the server to attach it. The server
 * decides everything that matters (admin, Place, path, type, size, and the stored file itself); this form only moves
 * bytes and shows progress.
 */
export function ModelUploadForm({
  places,
  modelPath,
  maxMegabytes,
}: {
  places: { id: string; name: string; category: string }[];
  /** The server's path for a Place's model, with `{placeId}` in place of the id. */
  modelPath: string;
  maxMegabytes: number;
}) {
  const [placeId, setPlaceId] = useState(places[0]?.id ?? "");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = new FormData(event.currentTarget).get("model");
    if (!(file instanceof File) || file.size === 0) {
      setError("Choose a .glb model file.");
      return;
    }
    if (file.size > maxMegabytes * 1024 * 1024) {
      setError(`Models must be ${maxMegabytes} MB or smaller so they load on a phone.`);
      return;
    }
    setError(null);
    setProgress(0);
    let url: string;
    try {
      const blob = await uploadPresigned(modelPath.replace("{placeId}", placeId), file, {
        access: "public",
        handleUploadUrl: "/api/admin/models/upload",
        clientPayload: placeId,
        contentType: "model/gltf-binary",
        multipart: file.size > MULTIPART_FROM_BYTES,
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });
      url = blob.url;
    } catch (cause) {
      setProgress(null);
      setError(cause instanceof Error && cause.message ? cause.message : "The upload failed. Try again.");
      return;
    }
    // Straight to the Server Action, which checks the stored file and redirects with the outcome. Not via a hidden
    // form (React would not have rendered the new URL into it yet), and outside the try: the redirect is Next.js's own.
    const attach = new FormData();
    attach.set("placeId", placeId);
    attach.set("url", url);
    await attachUploadedModelAction(attach);
  }

  const busy = progress !== null;

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-3">
        <Select label="Place" name="placeId" required value={placeId} onChange={(event) => setPlaceId(event.target.value)} disabled={busy}>
          {places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name} ({place.category})
            </option>
          ))}
        </Select>

        <label className="block space-y-1">
          <span className="text-sm font-medium text-slate-700">Model file</span>
          <input type="file" name="model" accept=".glb,model/gltf-binary" required disabled={busy} className="block w-full text-sm" />
          <span className="block text-xs text-slate-500">
            Binary glTF (.glb), up to {maxMegabytes} MB. New models start as drafts and are invisible to guests until enabled.
          </span>
        </label>

        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
        {busy ? (
          <p role="status" className="text-sm text-slate-600">
            {progress < 100 ? `Uploading… ${progress}%` : "Checking the file…"}
          </p>
        ) : null}

        <Button type="submit" disabled={busy}>
          Upload model
        </Button>
      </form>

    </>
  );
}
