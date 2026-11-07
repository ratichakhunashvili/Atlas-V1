import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/auth";
import { findPlaceById } from "@/db/queries/places";
import { findUserById } from "@/db/queries/users";
import { placeIdSchema } from "@/features/place-models/schema";
import { ALLOWED_MODEL_CONTENT_TYPES, MAX_MODEL_BYTES, modelStorageKey } from "@/services/map3d";

/*
 * Issues the short-lived token an admin's browser needs to upload ONE model file straight to Vercel Blob. Vercel
 * rejects function request bodies over 4.5 MB, so a model can't pass through a Server Action; the file never touches
 * this server. What does: the admin check (role read from the database, as requireAdmin does), the Place (read from
 * the database, never trusted from the browser) and the exact path, type and size the token allows.
 *
 * Uploading only puts a file in the store. Nothing is attached to a Place until attachUploadedModelAction checks the
 * stored file itself; a token that is never used, or a file that fails that check, changes nothing guests see.
 */
const TOKEN_LIFETIME_MS = 10 * 60 * 1000;

class Refused extends Error {}

async function assertAdmin() {
  const session = await auth();
  const user = session?.user ? await findUserById(session.user.id) : null;
  if (!user || user.role !== "admin") throw new Refused("Only administrators can upload models.");
}

export async function POST(request: Request) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "File storage isn't configured for this deployment." }, { status: 503 });
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        await assertAdmin();
        const placeId = placeIdSchema.safeParse(clientPayload ?? "");
        if (!placeId.success) throw new Refused("Choose a place.");
        const place = await findPlaceById(placeId.data);
        if (!place) throw new Refused("That place no longer exists.");
        if (pathname !== modelStorageKey(place.id)) throw new Refused("Unexpected file path.");
        return {
          allowedContentTypes: [...ALLOWED_MODEL_CONTENT_TYPES],
          maximumSizeInBytes: MAX_MODEL_BYTES,
          addRandomSuffix: true,
          validUntil: Date.now() + TOKEN_LIFETIME_MS,
        };
      },
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Refused) return NextResponse.json({ error: error.message }, { status: 403 });
    console.error("[models/upload] token request failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "The upload couldn't be started. Try again." }, { status: 400 });
  }
}
