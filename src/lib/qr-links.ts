/*
 * The link a printed Atlas QR code holds. Short and upper case on purpose: QR codes store capitals, digits and a few
 * symbols ("alphanumeric" mode) far more compactly than other text, so the printed code stays small and simple.
 *
 *   hotel entry   -> <SITE>/C/<TOKEN>   (app/C/[token] forwards to /checkin/<token>)
 *   place check-in -> <SITE>/U/<TOKEN>  (app/U/[token] forwards to /unlock/<token>)
 *
 * Browsers treat the scheme and host case-insensitively; the paths /C/ and /U/ are matched exactly. Codes printed
 * with the older /checkin/ and /unlock/ links keep working.
 */

export type QrLinkKind = "hotel" | "place";

export const QR_LINK_PREFIX: Record<QrLinkKind, string> = { hotel: "/C/", place: "/U/" };

export function qrLink(origin: string, kind: QrLinkKind, token: string): string {
  return `${origin.replace(/\/+$/, "").toUpperCase()}${QR_LINK_PREFIX[kind]}${token}`;
}
