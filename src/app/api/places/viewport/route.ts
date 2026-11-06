import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { viewportQuerySchema } from "@/features/places/nearby-schema";
import { getEligibleMapPlacesForGuest } from "@/services/eligibility";

// The home map asks for the catalogue Places inside its visible box each time the guest stops moving the map
// (catalogue plan §4, phase C3). Plain 401 JSON, as in ../nearby: this route is read by fetch(), not navigation.
//
// Eligibility: the hotel comes from the authenticated guest's own active stay. The box only narrows the area; the
// service clamps an oversized box and returns at most MAP_RESULT_CAP Places, with `truncated` when it cut. No
// hotelId/placeId is read from the request. No valid stay => an empty list, never "everything nearby".
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = viewportQuerySchema.safeParse({
    south: searchParams.get("south"),
    west: searchParams.get("west"),
    north: searchParams.get("north"),
    east: searchParams.get("east"),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid south/west/north/east" }, { status: 400 });
  }

  const result = await getEligibleMapPlacesForGuest({ userId: session.user.id, bounds: parsed.data });
  return NextResponse.json({ places: result.places, truncated: result.truncated });
}
