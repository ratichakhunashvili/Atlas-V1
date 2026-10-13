import type { CheckInMethod, Hotel, ItineraryDay, ItineraryStop, Place } from "@/db/schema";
import { calculateDayNumber } from "./stay-day";
import { firstUnvisitedStop } from "./check-in";

export type QrCheckInFailureReason = "invalid_qr" | "no_active_itinerary" | "place_not_next";

export type QrCheckInResult =
  | {
      ok: true;
      stop: ItineraryStop;
      nextStop: ItineraryStop | null;
      dayCompleted: boolean;
      /** True when the stop was already visited before this scan — no DB write happened, reported idempotently rather than as an error. */
      alreadyVisited: boolean;
    }
  | {
      ok: false;
      reason: QrCheckInFailureReason;
      message: string;
      nextStop?: { id: string; name: string };
    };

type ActiveHotelStay = {
  id: string;
  checkIn: Date;
  checkOut: Date | null;
  hotel: Hotel;
  place: Place;
};

export type QrCheckInDependencies = {
  findPlaceByQrToken: (qrToken: string) => Promise<Place | null>;
  findActiveStayForUser: (userId: string) => Promise<ActiveHotelStay | null>;
  findItineraryDay: (userId: string, hotelId: string, dayNumber: number) => Promise<ItineraryDay | null>;
  listItineraryStops: (dayId: string) => Promise<ItineraryStop[]>;
  markStopVisited: (stopId: string, dayId: string, checkInMethod: CheckInMethod) => Promise<{ stop: ItineraryStop; dayCompleted: boolean } | null>;
};

// Type-only imports only here — same lazy-load pattern as every other
// services/* boundary in Atlas (see check-in.ts / generate-itinerary.ts for
// the full rationale): db/queries/* modules start with `import "server-only"`.
async function loadDefaultDependencies(): Promise<QrCheckInDependencies> {
  const [placesQ, hotelStaysQ, itineraryQ] = await Promise.all([
    import("@/db/queries/places"),
    import("@/db/queries/hotel-stays"),
    import("@/db/queries/itinerary"),
  ]);
  return {
    findPlaceByQrToken: placesQ.findPlaceByQrToken,
    findActiveStayForUser: hotelStaysQ.findActiveStayForUser,
    findItineraryDay: itineraryQ.findItineraryDay,
    listItineraryStops: itineraryQ.listItineraryStops,
    markStopVisited: itineraryQ.markStopVisited,
  };
}

/**
 * Server-authoritative QR check-in. Unlike GPS check-in, the client supplies
 * no stopId — only an opaque token. The server resolves token -> Place,
 * resolves the authenticated user's own active stay -> today's itinerary day
 * (never a client-supplied hotelId/dayId), and only completes the stop whose
 * placeId matches the scanned Place AND is that day's first unvisited stop.
 * A valid QR proves "this is Place A"; it does not by itself prove the user
 * is allowed to complete Place A right now — both must hold.
 */
export async function checkInStopWithQr(
  input: { userId: string; qrToken: string },
  now: Date = new Date(),
  deps?: QrCheckInDependencies
): Promise<QrCheckInResult> {
  const d = deps ?? (await loadDefaultDependencies());

  const trimmedToken = input.qrToken.trim();
  if (!trimmedToken) {
    return { ok: false, reason: "invalid_qr", message: "Invalid QR code." };
  }

  const place = await d.findPlaceByQrToken(trimmedToken);
  if (!place) {
    return { ok: false, reason: "invalid_qr", message: "Invalid QR code." };
  }

  const stay = await d.findActiveStayForUser(input.userId);
  if (!stay) {
    return { ok: false, reason: "no_active_itinerary", message: "You don't have an active itinerary to check in against." };
  }

  const dayNumberResult = calculateDayNumber(stay.checkIn, stay.checkOut, now);
  if (!dayNumberResult.ok) {
    return { ok: false, reason: "no_active_itinerary", message: "You don't have an active itinerary to check in against." };
  }

  const day = await d.findItineraryDay(input.userId, stay.hotel.id, dayNumberResult.dayNumber);
  if (!day) {
    return { ok: false, reason: "no_active_itinerary", message: "You don't have an active itinerary to check in against." };
  }

  const stops = await d.listItineraryStops(day.id);
  // The scanned Place must correspond to a stop in THIS user's own itinerary
  // — never another user's, and never resolved from a client-supplied
  // placeId/stopId. A coincidental match in someone else's itinerary is
  // irrelevant: ownership is entirely a function of `input.userId` here.
  const matchingStop = stops.find((stop) => stop.placeId === place.id);
  if (!matchingStop) {
    return { ok: false, reason: "place_not_next", message: "This place isn't part of your current itinerary." };
  }

  if (matchingStop.visitedAt !== null) {
    return {
      ok: true,
      stop: matchingStop,
      nextStop: firstUnvisitedStop(stops),
      dayCompleted: stops.every((stop) => stop.visitedAt !== null),
      alreadyVisited: true,
    };
  }

  const required = firstUnvisitedStop(stops);
  if (!required || required.id !== matchingStop.id) {
    // A valid QR for a real Place in the itinerary, but not the one the
    // guest is allowed to complete yet — order still governs.
    return {
      ok: false,
      reason: "place_not_next",
      message: "Check in your stops in order — this isn't your next stop yet.",
      nextStop: required ? { id: required.id, name: required.name } : undefined,
    };
  }

  const updated = await d.markStopVisited(matchingStop.id, day.id, "qr");
  if (!updated) {
    // Lost a concurrent race — another simultaneous scan already committed the visit.
    const freshStops = await d.listItineraryStops(day.id);
    const freshStop = freshStops.find((stop) => stop.id === matchingStop.id) ?? matchingStop;
    return {
      ok: true,
      stop: freshStop,
      nextStop: firstUnvisitedStop(freshStops),
      dayCompleted: freshStops.every((stop) => stop.visitedAt !== null),
      alreadyVisited: true,
    };
  }

  const freshStops = await d.listItineraryStops(day.id);
  return {
    ok: true,
    stop: updated.stop,
    nextStop: firstUnvisitedStop(freshStops),
    dayCompleted: updated.dayCompleted,
    alreadyVisited: false,
  };
}
