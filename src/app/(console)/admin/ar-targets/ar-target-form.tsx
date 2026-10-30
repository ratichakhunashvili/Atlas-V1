"use client";

import { useState } from "react";
import { Button } from "@/components/shared/button";
import { Select } from "@/components/shared/select";
import { hashFromImageFile } from "@/components/ar/capture";
import { saveArTargetAction } from "@/features/ar-targets/actions";

/**
 * Creating a camera reference from an image, without the image going anywhere.
 *
 * The file input is `type="file"` but it is **not** part of what gets submitted:
 * on selection the browser reduces it to a 60-character hash, the hash goes into
 * a hidden field, and the form posts that. The file never reaches the network and
 * is never stored.
 *
 * The hash is shown to the admin so they can see something was actually computed,
 * and because for an admin it is a useful "did this change?" check. It is not a
 * secret to them; it is a secret from guests, which is why it is never rendered
 * anywhere guest-facing.
 */
export function ArTargetForm({
  places,
}: {
  places: { id: string; name: string; hasTarget: boolean }[];
}) {
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(null);
    setHash(null);
    if (!file) return;

    setWorking(true);
    try {
      setHash(await hashFromImageFile(file));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "That file could not be read as an image.");
    } finally {
      setWorking(false);
    }
  }

  return (
    <form action={saveArTargetAction} className="space-y-3">
      <Select label="Place" name="placeId" required>
        <option value="">Choose a place…</option>
        {places.map((place) => (
          <option key={place.id} value={place.id}>
            {place.name}
            {place.hasTarget ? " (replaces existing reference)" : ""}
          </option>
        ))}
      </Select>

      <label className="block text-sm">
        <span className="font-medium">Reference photo</span>
        <input
          type="file"
          accept="image/*"
          onChange={onFileChosen}
          className="mt-1 block w-full text-sm"
          // Deliberately unnamed: an input with no name is not submitted, so the
          // image cannot be posted even by accident.
        />
        <span className="mt-1 block text-xs text-slate-500">
          Photograph the Place the way a guest standing in front of it would. The image stays on this
          computer — only a short fingerprint of it is saved.
        </span>
      </label>

      <label className="block text-sm">
        <span className="font-medium">Note (optional)</span>
        <input
          type="text"
          name="description"
          maxLength={200}
          placeholder="e.g. the front entrance, from the square"
          className="mt-1 block w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
      </label>

      {working && <p className="text-sm text-slate-600">Reading the image…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {hash && (
        <p className="break-all text-xs text-slate-500">
          Fingerprint: <code>{hash}</code>
        </p>
      )}

      <input type="hidden" name="targetHash" value={hash ?? ""} />

      <Button type="submit" disabled={!hash || working}>
        Save reference
      </Button>
    </form>
  );
}
