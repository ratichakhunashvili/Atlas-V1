import { NextResponse } from "next/server";
import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { isBlobConfigured } from "@/services/storage/server";
import { auth } from "@/auth";
import { findPlaceById } from "@/db/queries/places";
import { findUserById } from "@/db/queries/users";
import { placeIdSchema } from "@/features/place-models/schema";
import { ALLOWED_MODEL_CONTENT_TYPES, MAX_MODEL_BYTES, modelStorageKey } from "@/services/map3d";

/*
 * Issues the short-lived presigned URL an admin's browser needs to upload ONE model file straight to Vercel Blob. Vercel
 * rejects function request bodies over 4.5 MB, so a model can't pass through a Server Action; the file never touches
 * this server. What does: the admin check (role read from the database, as requireAdmin does), the Place (read from
 * the database, never trusted from the browser) and the exact path, type and size the token allows.
 *
 * The store authenticates this server with Vercel OIDC (BLOB_STORE_ID; no long-lived secret), and the signed token
 * it issues is scoped to the one path, the PUT operation, the type, the size and ten minutes.
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
  if (!isBlobConfigured) {
    return NextResponse.json({ error: "File storage isn't configured for this deployment." }, { status: 503 });
  }

  let body: HandleUploadPresignedBody;
  try {
    body = (await request.json()) as HandleUploadPresignedBody;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    const result = await handleUploadPresigned({
      request,
      body,
      getSignedToken: async (pathname, clientPayload) => {
        await assertAdmin();
        const placeId = placeIdSchema.safeParse(clientPayload ?? "");
        if (!placeId.success) throw new Refused("Choose a place.");
        const place = await findPlaceById(placeId.data);
        if (!place) throw new Refused("That place no longer exists.");
        if (pathname !== modelStorageKey(place.id)) throw new Refused("Unexpected file path.");
        const validUntil = Date.now() + TOKEN_LIFETIME_MS;
        const limits = { allowedContentTypes: [...ALLOWED_MODEL_CONTENT_TYPES], maximumSizeInBytes: MAX_MODEL_BYTES, validUntil };
        return {
          token: await issueSignedToken({ pathname, operations: ["put"], ...limits }),
          urlOptions: { ...limits, addRandomSuffix: true },
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
