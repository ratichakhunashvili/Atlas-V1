import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { listPlacesNear } from "@/db/queries/places";

const DEFAULT_RADIUS_M = 5000;
const MAX_RADIUS_M = 50000;

const querySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().min(100).max(MAX_RADIUS_M).optional(),
});

// Plain 401 JSON here, not requireUser()'s redirect("/login") — this route is
// consumed by client-side fetch(), not browser navigation, so a redirect
// response would just hand the caller an HTML login page instead of JSON.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    lat: searchParams.get("lat"),
    lng: searchParams.get("lng"),
    radius: searchParams.get("radius") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lat/lng/radius" }, { status: 400 });
  }

  const places = await listPlacesNear(
    { lat: parsed.data.lat, lng: parsed.data.lng },
    parsed.data.radius ?? DEFAULT_RADIUS_M
  );

  return NextResponse.json({ places });
}
