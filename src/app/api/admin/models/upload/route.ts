import { NextResponse } from "next/server";
import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { isBlobConfigured } from "@/services/storage/server";
import { findPlaceById } from "@/db/queries/places";
import { currentSession } from "@/lib/authorization";
import { isPasswordSession } from "@/lib/session-standing";
import { placeIdSchema } from "@/features/place-models/schema";
import { modelUploadRefusal } from "@/features/place-models/upload-gate";
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
  // currentSession reads the account row (the fresh role) and refuses a token whose session was ended.
  const session = await currentSession();
  if (session.status !== "signed-in" || session.account.role !== "admin" || !isPasswordSession(session.authMethod)) throw new Refused("Only administrators can upload models.");
}

export async function POST(request: Request) {
  // Authorization first: a guest gets 401/403, never a hint about how storage is configured (features/place-models/upload-gate.ts).
  // No onUploadCompleted is registered below, so Vercel never posts a session-less completion callback to this route.
  const refusal = modelUploadRefusal(await currentSession(), isBlobConfigured);
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });

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
