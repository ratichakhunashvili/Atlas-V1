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
import { generateRawQrToken, hashQrToken } from "@/services/qr";
import { credentialSubjectSchema } from "./schema";
import { reserveAttempt } from "@/db/queries/rate-limit";
import { recordAdminAudit } from "@/db/queries/admin-audit";
import { rateLimitedMessage } from "@/services/rate-limit/policy";

/**
 * The raw token exists in exactly one place: this result, once. It is generated
 * here, hashed, stored as a hash, and returned to the admin who asked for it.
 * Nothing reads it back afterwards — there is nothing to read. Losing it means
 * issuing a new one, which revokes the old.
 */
export type IssueCredentialResult =
  | { ok: true; rawToken: string; replacedExisting: boolean }
  | { ok: false; error: string };

export type RevokeCredentialResult = { ok: true; revoked: boolean } | { ok: false; error: string };

export async function issueHotelEntryCredentialAction(hotelId: string): Promise<IssueCredentialResult> {
  const admin = await requireAdmin();

  /*
   * Counts EVERY issue/rotate, succeeded or failed. Counting only failures would
   * leave an unthrottled loop of successful rotations — each one mints a new
   * credential and revokes the last, which is exactly the expensive, sensitive
   * operation worth limiting. Reserved before the work so the count and the
   * decision happen together.
   */
  const reserved = await reserveAttempt({ scope: "qr_credential_issue", actorId: admin.id, now: new Date() });
  if (!reserved.allowed) return { ok: false, error: rateLimitedMessage() };

  if (!credentialSubjectSchema.safeParse({ id: hotelId }).success) return { ok: false, error: "Hotel not found." };

  const hotel = await findHotelById(hotelId);
  if (!hotel) return { ok: false, error: "Hotel not found." };

  const existing = await findActiveQrCredentialForHotel(hotelId);
  const rawToken = generateRawQrToken();

  await issueQrCredential({
    purpose: "hotel_entry",
    hotelId,
    tokenHash: hashQrToken(rawToken),
    // Approved default (2026-10-14): no expiry. These are printed and mounted;
    // they end by revocation or rotation, not on a date nobody recorded.
    expiresAt: null,
    createdByUserId: admin.id,
  });

  // The trail records THAT a credential was issued or rotated — never its token or hash.
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

  /*
   * Counts EVERY issue/rotate, succeeded or failed. Counting only failures would
   * leave an unthrottled loop of successful rotations — each one mints a new
   * credential and revokes the last, which is exactly the expensive, sensitive
   * operation worth limiting. Reserved before the work so the count and the
   * decision happen together.
   */
  const reserved = await reserveAttempt({ scope: "qr_credential_issue", actorId: admin.id, now: new Date() });
  if (!reserved.allowed) return { ok: false, error: rateLimitedMessage() };

  if (!credentialSubjectSchema.safeParse({ id: placeId }).success) return { ok: false, error: "Place not found." };

  const place = await findPlaceById(placeId);
  if (!place) return { ok: false, error: "Place not found." };

  const existing = await findActiveQrCredentialForPlace(placeId);
  const rawToken = generateRawQrToken();

  await issueQrCredential({
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
