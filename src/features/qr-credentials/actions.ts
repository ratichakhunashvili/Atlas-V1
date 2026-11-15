"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authorization";
import { findHotelById } from "@/db/queries/hotels";
import { findPlaceById } from "@/db/queries/places";
import {
  findActiveQrCredentialForHotel,
  findActiveQrCredentialForPlace,
  issueQrCredential,
  revokeQrCredential,
} from "@/db/queries/qr-credentials";
import { hashQrToken } from "@/services/qr";
import { QR_SECRET_MISSING_MESSAGE, newPermanentQrCredential, qrCodeSecret, revealPermanentQrToken } from "@/services/qr/permanent";
import { credentialSubjectSchema } from "./schema";
import { reserveAttempt } from "@/db/queries/rate-limit";
import { recordAdminAudit } from "@/db/queries/admin-audit";
import { rateLimitedMessage } from "@/services/rate-limit/policy";

/**
 * Permanent codes (services/qr/permanent.ts): each hotel and place has one code that stays the same, calculated from
 * the server's secret and its credential row. The database holds only the hash. An admin can show the same code
 * again at any time (reveal); creating one only happens when there is none, and replacing one is an emergency step
 * that changes the code.
 *
 * The raw code only ever leaves the server as the return value of an action an admin triggered, never in a page.
 */
export type IssueCredentialResult =
  | { ok: true; rawToken: string; replacedExisting: boolean }
  | { ok: false; error: string };

/** "legacy": an older random code that Atlas never kept, so it cannot be shown again (replace it to get a permanent one). */
export type RevealCredentialResult = { ok: true; rawToken: string } | { ok: false; error: string; legacy?: boolean };

export type RevokeCredentialResult = { ok: true; revoked: boolean } | { ok: false; error: string };

const LEGACY_MESSAGE =
  "This code was made before permanent codes, and Atlas never kept a copy of it. It still works where it is printed. To get a permanent code you can download any time, replace it (the old printed code then stops working).";

export async function issueHotelEntryCredentialAction(hotelId: string): Promise<IssueCredentialResult> {
  const admin = await requireAdmin();

  /*
   * Counts EVERY issue/replace, succeeded or failed. Counting only failures would
   * leave an unthrottled loop of successful replacements — each one mints a new
   * credential and revokes the last, which is exactly the expensive, sensitive
   * operation worth limiting. Reserved before the work so the count and the
   * decision happen together.
   */
  const reserved = await reserveAttempt({ scope: "qr_credential_issue", actorId: admin.id, now: new Date() });
  if (!reserved.allowed) return { ok: false, error: rateLimitedMessage() };

  if (!credentialSubjectSchema.safeParse({ id: hotelId }).success) return { ok: false, error: "Hotel not found." };

  const secret = qrCodeSecret();
  if (!secret) return { ok: false, error: QR_SECRET_MISSING_MESSAGE };

  const hotel = await findHotelById(hotelId);
  if (!hotel) return { ok: false, error: "Hotel not found." };

  const existing = await findActiveQrCredentialForHotel(hotelId);
  const { id, rawToken } = newPermanentQrCredential(secret);

  await issueQrCredential({
    id,
    purpose: "hotel_entry",
    hotelId,
    tokenHash: hashQrToken(rawToken),
    // Approved default (2026-10-14): no expiry. These are printed and mounted;
    // they end by revocation or replacement, not on a date nobody recorded.
    expiresAt: null,
    createdByUserId: admin.id,
  });

  // The trail records THAT a credential was issued or replaced — never its token or hash.
  await recordAdminAudit({
    actorUserId: admin.id,
    action: existing ? "qr_credential.rotated" : "qr_credential.issued",
    targetType: "hotel_entry_credential",
    targetId: hotelId,
    hotelId,
    after: { purpose: "hotel_entry", replacedPrevious: existing !== null },
  });

  revalidatePath(`/admin/hotels/${hotelId}`);
  revalidatePath("/admin/hotels");
  return { ok: true, rawToken, replacedExisting: existing !== null };
}

export async function issuePlaceCheckInCredentialAction(placeId: string): Promise<IssueCredentialResult> {
  const admin = await requireAdmin();

  // Counts every issue/replace (see issueHotelEntryCredentialAction).
  const reserved = await reserveAttempt({ scope: "qr_credential_issue", actorId: admin.id, now: new Date() });
  if (!reserved.allowed) return { ok: false, error: rateLimitedMessage() };

  if (!credentialSubjectSchema.safeParse({ id: placeId }).success) return { ok: false, error: "Place not found." };

  const secret = qrCodeSecret();
  if (!secret) return { ok: false, error: QR_SECRET_MISSING_MESSAGE };

  const place = await findPlaceById(placeId);
  if (!place) return { ok: false, error: "Place not found." };

  const existing = await findActiveQrCredentialForPlace(placeId);
  const { id, rawToken } = newPermanentQrCredential(secret);

  await issueQrCredential({
    id,
    purpose: "place_check_in",
    placeId,
    tokenHash: hashQrToken(rawToken),
    expiresAt: null,
    createdByUserId: admin.id,
  });

  await recordAdminAudit({
    actorUserId: admin.id,
    action: existing ? "qr_credential.rotated" : "qr_credential.issued",
    targetType: "place_check_in_credential",
    targetId: placeId,
    after: { purpose: "place_check_in", replacedPrevious: existing !== null },
  });

  revalidatePath(`/admin/places/${placeId}`);
  return { ok: true, rawToken, replacedExisting: existing !== null };
}

/** Shows a hotel's current permanent code again. Changes nothing. */
export async function revealHotelEntryCredentialAction(hotelId: string): Promise<RevealCredentialResult> {
  await requireAdmin();
  if (!credentialSubjectSchema.safeParse({ id: hotelId }).success) return { ok: false, error: "Hotel not found." };
  const secret = qrCodeSecret();
  if (!secret) return { ok: false, error: QR_SECRET_MISSING_MESSAGE };
  const existing = await findActiveQrCredentialForHotel(hotelId);
  if (!existing) return { ok: false, error: "This hotel has no code yet. Create one first." };
  const rawToken = revealPermanentQrToken(secret, existing);
  return rawToken ? { ok: true, rawToken } : { ok: false, error: LEGACY_MESSAGE, legacy: true };
}

/** Shows a place's current permanent code again. Changes nothing. */
export async function revealPlaceCheckInCredentialAction(placeId: string): Promise<RevealCredentialResult> {
  await requireAdmin();
  if (!credentialSubjectSchema.safeParse({ id: placeId }).success) return { ok: false, error: "Place not found." };
  const secret = qrCodeSecret();
  if (!secret) return { ok: false, error: QR_SECRET_MISSING_MESSAGE };
  const existing = await findActiveQrCredentialForPlace(placeId);
  if (!existing) return { ok: false, error: "This place has no code yet. Create one first." };
  const rawToken = revealPermanentQrToken(secret, existing);
  return rawToken ? { ok: true, rawToken } : { ok: false, error: LEGACY_MESSAGE, legacy: true };
}

export async function revokeHotelEntryCredentialAction(hotelId: string): Promise<RevokeCredentialResult> {
  const admin = await requireAdmin();

  if (!credentialSubjectSchema.safeParse({ id: hotelId }).success) return { ok: false, error: "Hotel not found." };

  const existing = await findActiveQrCredentialForHotel(hotelId);
  if (!existing) return { ok: true, revoked: false };

  const revoked = await revokeQrCredential(existing.id);
  if (revoked) {
    await recordAdminAudit({
      actorUserId: admin.id,
      action: "qr_credential.revoked",
      targetType: "hotel_entry_credential",
      targetId: hotelId,
      hotelId,
      after: { purpose: "hotel_entry" },
    });
  }
  revalidatePath(`/admin/hotels/${hotelId}`);
  revalidatePath("/admin/hotels");
  return { ok: true, revoked: revoked !== null };
}

export async function revokePlaceCheckInCredentialAction(placeId: string): Promise<RevokeCredentialResult> {
  const admin = await requireAdmin();

  if (!credentialSubjectSchema.safeParse({ id: placeId }).success) return { ok: false, error: "Place not found." };

  const existing = await findActiveQrCredentialForPlace(placeId);
  if (!existing) return { ok: true, revoked: false };

  const revoked = await revokeQrCredential(existing.id);
  if (revoked) {
    await recordAdminAudit({
      actorUserId: admin.id,
      action: "qr_credential.revoked",
      targetType: "place_check_in_credential",
      targetId: placeId,
      after: { purpose: "place_check_in" },
    });
  }
  revalidatePath(`/admin/places/${placeId}`);
  return { ok: true, revoked: revoked !== null };
}
