import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { DEFAULT_NEARBY_RADIUS_METERS, nearbyQuerySchema } from "@/features/places/nearby-schema";
import { getEligibleMapPlacesForGuest } from "@/services/eligibility";

// Plain 401 JSON here, not requireUser()'s redirect("/login") — this route is
// consumed by client-side fetch(), not browser navigation, so a redirect
// response would just hand the caller an HTML login page instead of JSON.
//
// Eligibility: the hotel is derived server-side from the authenticated
// guest's own active stay. lat/lng/radius only narrow the map area (and the
// radius is bounded here AND in the service); they can never add a Place,
// and no hotelId/placeId is read from the request at all. No valid stay =>
// an empty list, never "everything nearby".
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = nearbyQuerySchema.safeParse({
    lat: searchParams.get("lat"),
    lng: searchParams.get("lng"),
    radius: searchParams.get("radius") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lat/lng/radius" }, { status: 400 });
  }

  const result = await getEligibleMapPlacesForGuest({
    userId: session.user.id,
    center: { lat: parsed.data.lat, lng: parsed.data.lng },
    radiusMeters: parsed.data.radius ?? DEFAULT_NEARBY_RADIUS_METERS,
  });

  return NextResponse.json({ places: result.places });
}
