import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { qrCredentials, type QrCredential, type QrPurpose } from "@/db/schema";

/** Resolution is by hash only — the raw token is never stored, so there is nothing else to look up by. */
export async function findQrCredentialByHash(tokenHash: string): Promise<QrCredential | null> {
  const [row] = await db.select().from(qrCredentials).where(eq(qrCredentials.tokenHash, tokenHash)).limit(1);
  return row ?? null;
}

/** The live credential for a subject, if one exists. Used by admin screens to report "configured" without ever reading a secret. */
export async function findActiveQrCredentialForHotel(hotelId: string): Promise<QrCredential | null> {
  const [row] = await db
    .select()
    .from(qrCredentials)
    .where(and(eq(qrCredentials.hotelId, hotelId), isNull(qrCredentials.revokedAt)))
    .limit(1);
  return row ?? null;
}

export async function findActiveQrCredentialForPlace(placeId: string): Promise<QrCredential | null> {
  const [row] = await db
    .select()
    .from(qrCredentials)
    .where(and(eq(qrCredentials.placeId, placeId), isNull(qrCredentials.revokedAt)))
    .limit(1);
  return row ?? null;
}

/**
 * Issues a credential, replacing any live one for the same subject in a single
 * transaction — so rotation can never leave two working codes on two walls, and
 * a failure part-way leaves the old code working rather than none at all.
 *
 * Takes the HASH, never the raw token: the caller generates the secret, shows it
 * once and forgets it. `qr_credentials_active_{hotel,place}_idx` backstops this
 * at the database level if two admins rotate at the same moment.
 */
export async function issueQrCredential(input: {
  purpose: QrPurpose;
  hotelId?: string | null;
  placeId?: string | null;
  tokenHash: string;
  expiresAt?: Date | null;
  createdByUserId: string;
}): Promise<QrCredential> {
  return db.transaction(async (tx) => {
    const subject = input.hotelId
      ? eq(qrCredentials.hotelId, input.hotelId)
      : eq(qrCredentials.placeId, input.placeId as string);

    await tx
      .update(qrCredentials)
      .set({ revokedAt: new Date() })
      .where(and(subject, isNull(qrCredentials.revokedAt)));

    const [created] = await tx
      .insert(qrCredentials)
      .values({
        purpose: input.purpose,
        hotelId: input.hotelId ?? null,
        placeId: input.placeId ?? null,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt ?? null,
        createdByUserId: input.createdByUserId,
      })
      .returning();

    return created;
  });
}

/** Revokes without issuing a replacement. Idempotent: revoking an already-revoked credential keeps the first revocation time. */
export async function revokeQrCredential(credentialId: string): Promise<QrCredential | null> {
  const [row] = await db
    .update(qrCredentials)
    .set({ revokedAt: new Date() })
    .where(and(eq(qrCredentials.id, credentialId), isNull(qrCredentials.revokedAt)))
    .returning();
  return row ?? null;
}
