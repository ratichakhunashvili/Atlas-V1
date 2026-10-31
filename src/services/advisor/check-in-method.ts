import type { CheckInMethod } from "@/db/schema";

/**
 * How a guest is actually trying to prove they are at a stop right now.
 * Deliberately narrower than `CheckInMethod`: "auto" is a legacy *stored*
 * value (see below), never something a guest can attempt.
 */
export type AttemptedCheckInMethod = "gps" | "qr" | "ar";

/**
 * The stop's saved `checkInMethod` is the authority on how it may be
 * completed, and it is decided once at generation time
 * (generate-itinerary.ts -> resolveCheckInMethod: partners and
 * landmark/historical Places get "qr", everything else "gps").
 *
 * Without this check a guest standing anywhere within 150 m could GPS their
 * way past a partner's QR code — which is exactly what that partner's QR
 * requirement exists to prevent. The client picks which action it calls, so
 * this has to be enforced on the server, per attempt, and it must never be
 * inferred from the attempt itself.
 *
 * "auto" is accepted by any method purely for compatibility: no code path
 * has ever written it (every writer sets "gps" or "qr"), but the column
 * allows it, and a legacy row must not become permanently uncompletable.
 *
 * ## Where AR sits, and why
 *
 * An AR attempt carries everything a GPS attempt carries — the same evidence
 * validation, the same 150 m proximity — and then additionally requires the
 * camera frame to match the Place's stored reference. It is therefore STRICTLY
 * STRONGER than GPS, and a "gps" stop accepts it: offering a guest a harder way
 * to prove the same thing takes nothing away.
 *
 * The converse is false and is the rule that matters: a "qr" stop does NOT
 * accept AR. A QR credential proves possession of something issued at the venue;
 * a photograph proves a framing. Letting a camera stand in for the code would
 * dissolve exactly the guarantee a partner's QR requirement exists to give, so
 * AR must never become that bypass. For the same reason a stop saved as "ar" is
 * not completable by plain GPS — the camera match is the point of it.
 *
 * Nothing currently WRITES "ar" (generation still produces only "gps" and "qr"),
 * so in practice AR today is an optional stronger path on ordinary GPS stops and
 * a guest who denies the camera still has GPS. The "ar" row below exists so that
 * if a later approved phase starts assigning it, the enforcement is already
 * correct rather than silently permissive.
 */
export function isCheckInMethodAllowed(saved: CheckInMethod, attempted: AttemptedCheckInMethod): boolean {
  switch (saved) {
    // Legacy value only; see above.
    case "auto":
      return true;
    // GPS stops accept the plain reading or the strictly stronger camera match.
    case "gps":
      return attempted === "gps" || attempted === "ar";
    // The credential is the requirement. Nothing substitutes for it.
    case "qr":
      return attempted === "qr";
    // The daily plan: the QR code OR the location, each verified in full. The camera match is GPS plus more.
    case "qr_or_gps":
      return attempted === "qr" || attempted === "gps" || attempted === "ar";
    // The camera match is the requirement; standing nearby is not enough.
    case "ar":
      return attempted === "ar";
    default:
      // An unrecognised stored value refuses every attempt rather than
      // defaulting open. A stop nobody can complete is a visible bug; a stop
      // anybody can complete is a silent one.
      return false;
  }
}

/** Plain-language refusal, phrased for the guest rather than naming the column. */
export function wrongCheckInMethodMessage(saved: CheckInMethod): string {
  switch (saved) {
    case "qr":
      return "This stop is confirmed by scanning its QR code when you arrive.";
    case "ar":
      return "This stop is confirmed by pointing your camera at it when you arrive.";
    case "qr_or_gps":
      return "Check in by scanning the place's QR code or with your location when you arrive.";
    default:
      return "This stop is confirmed by your location when you arrive, not by a QR code.";
  }
}
