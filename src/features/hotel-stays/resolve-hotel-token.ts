import "server-only";
import { findHotelById } from "@/db/queries/hotels";
import { findQrCredentialByHash } from "@/db/queries/qr-credentials";
import { resolveScannedQrToken } from "@/services/qr";
import { checkInTokenSchema } from "./schema";

/**
 * Resolves a scanned hotel-entry credential to its hotel, server-side.
 *
 * Every failure — unknown, revoked, expired, or a Place check-in code presented
 * here — returns null on purpose: telling a scanner *why* a code was refused
 * tells an attacker which codes exist. services/qr keeps the specific reason for
 * tests and logs.
 *
 * A plain server module (not "use server"), so it is never callable from a browser.
 */
export async function resolveHotelFromToken(rawToken: string, now: Date) {
  const parsed = checkInTokenSchema.safeParse({ token: rawToken });
  if (!parsed.success) return null;

  const resolution = await resolveScannedQrToken(parsed.data.token, "hotel_entry", findQrCredentialByHash, now);
  if (!resolution.ok || !resolution.credential.hotelId) return null;

  return findHotelById(resolution.credential.hotelId);
}
