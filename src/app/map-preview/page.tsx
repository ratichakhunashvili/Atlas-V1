import Link from "next/link";
import { notFound } from "next/navigation";
import { shouldBlockDevelopmentOnlyPath } from "@/lib/development-route-policy";
import { Alert } from "@/components/shared/alert";
import { AtlasMap } from "@/components/map/atlas-map";
import type { AdvisorStopView } from "@/services/advisor/current-itinerary";
import { getWalkingRouteInOrder, type OrderedWalkingRoute, type RoutingFailureReason } from "@/services/routing";
import {
  DEMO_DISCLAIMER,
  DEMO_HOTEL,
  DEMO_STOPS,
  DEMO_TRIP_BOUNDS,
  formatDistance,
  formatDuration,
} from "./sample-trip";

export const metadata = {
  title: "Atlas map preview",
  description: "Development-only preview of the Georgia map with a demo itinerary route.",
};

// Never prerender: this page calls the routing service per request and must not run at build time.
export const dynamic = "force-dynamic";

type RouteOutcome =
  | { ok: true; route: OrderedWalkingRoute; tokenNote: string | null }
  | { ok: false; reason: RoutingFailureReason; message: string };

// A dev-server-lifetime cache so reloading the preview does not re-call Mapbox every time. Successes only.
let cached: RouteOutcome | null = null;

/**
 * The existing routing integration (services/routing -> Mapbox Directions, walking profile): the route follows
 * roads and paths between the fixed demo points in EXACTLY this order, hotel -> stop 1 -> stop 2 -> stop 3 -> hotel.
 * Mapbox is used only to route; it is never asked to search for or choose places. If routing fails the page says
 * so — it never draws a straight-line fallback.
 */
async function loadDemoRoute(): Promise<RouteOutcome> {
  if (cached?.ok) return cached;

  // The server token is the intended credential. This development-only page falls back to the public (browser)
  // Mapbox token when MAPBOX_SERVER_TOKEN is empty, and says so on the page. No token is ever printed or sent to the client.
  const serverToken = process.env.MAPBOX_SERVER_TOKEN ?? "";
  const publicToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";
  const accessToken = serverToken || publicToken;
  const tokenNote = serverToken
    ? null
    : "MAPBOX_SERVER_TOKEN is empty, so this development preview used the public Mapbox token for the routing request.";

  const result = await getWalkingRouteInOrder(
    {
      origin: { lat: DEMO_HOTEL.latitude, lng: DEMO_HOTEL.longitude },
      stops: DEMO_STOPS.map((stop) => ({ lat: stop.latitude, lng: stop.longitude })),
      returnToOrigin: true,
    },
    { accessToken }
  );

  const outcome: RouteOutcome = result.ok
    ? { ok: true, route: result.route, tokenNote }
    : { ok: false, reason: result.reason, message: result.message };
  if (outcome.ok) cached = outcome;
  return outcome;
}

const FAILURE_HELP: Record<RoutingFailureReason, string> = {
  config: "No Mapbox token is configured for routing. Set MAPBOX_SERVER_TOKEN in .env.local (see .env.example).",
  http: "Mapbox rejected the routing request. A token restricted to specific URLs, or without Directions access, causes this. Set a server-side MAPBOX_SERVER_TOKEN in .env.local.",
  network: "Could not reach Mapbox from the server. Check the network connection.",
  no_route: "Mapbox could not find a walking route between the demo points.",
  malformed_response: "Mapbox returned a response that could not be read.",
  invalid_input: "The demo coordinates were rejected as invalid.",
};

/** Numbered markers for the three demo stops. Status "current" is used only so every number is drawn in the prominent colour; nothing here is an itinerary record. */
const demoStopViews: AdvisorStopView[] = DEMO_STOPS.map((stop, index) => ({
  id: stop.id,
  position: index,
  placeId: null,
  name: stop.name,
  category: null,
  latitude: stop.latitude,
  longitude: stop.longitude,
  imageUrl: null,
  isHotelStop: false,
  visitDurationMinutes: null,
  walkMinutesFromPrevious: 0,
  checkInMethod: "gps",
      canCheckInWithCamera: false,
  visitedAt: null,
  status: "current",
  unavailableReason: null,
  unavailableMessage: null,
}));

/**
 * DEVELOPMENT-ONLY preview of the map with a SAMPLE itinerary. It uses made-up demo locations (see ./sample-trip.ts),
 * no database, no authentication and none of Atlas's eligibility or recommendation logic. Returns 404 in production.
 */
export default async function MapPreviewPage() {
  if (shouldBlockDevelopmentOnlyPath("/map-preview", process.env.NODE_ENV, process.env.ATLAS_DEPLOYMENT_ENV)) notFound();

  const outcome = await loadDemoRoute();

  return (
    // Explicit light palette: the global stylesheet switches body text to near-white in the browser's dark mode, which
    // would make this page's slate text unreadable.
    <div className="flex flex-1 flex-col bg-slate-50 text-slate-900">
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-3 px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-lg font-semibold">Atlas map preview · sample itinerary</h1>
        <Link href="/demo" className="text-sm text-slate-600 underline">
          Guest-flow demo
        </Link>
      </div>

      <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <strong>DEMO ONLY.</strong> {DEMO_DISCLAIMER} The route is Mapbox walking directions between these fixed points, drawn along
        roads. Nothing here is read from or written to the database, and none of it is a recommendation. Use <em>Georgia</em> to see the
        whole country, and <em>2D/3D</em> to flatten or tilt the view.
      </p>

      {outcome.ok ? (
        <p className="text-sm text-slate-700">
          Demo Hotel → Stop 1 → Stop 2 → Stop 3 → Demo Hotel ·{" "}
          <strong>{formatDistance(outcome.route.distanceMeters)}</strong> · about{" "}
          <strong>{formatDuration(outcome.route.durationSeconds)}</strong> walking
        </p>
      ) : (
        <Alert>
          <strong>No route drawn.</strong> {FAILURE_HELP[outcome.reason]} (Mapbox status: {outcome.reason}.) A straight line is never drawn
          as a substitute.
        </Alert>
      )}
      {outcome.ok && outcome.tokenNote && <p className="text-xs text-slate-500">{outcome.tokenNote}</p>}

      <div className="relative h-[70vh] min-h-[420px] overflow-hidden rounded-lg border border-slate-200">
        <AtlasMap
          places={[]}
          anchorMarker={{ latitude: DEMO_HOTEL.latitude, longitude: DEMO_HOTEL.longitude, label: "H", title: DEMO_HOTEL.name }}
          route={outcome.ok ? outcome.route.geometry : null}
          itineraryStops={demoStopViews}
          focusBounds={DEMO_TRIP_BOUNDS}
          focusLabel="Trip"
          isolatedPreview
        />
      </div>

      <ol className="grid gap-1 text-xs text-slate-600 sm:grid-cols-3">
        {DEMO_STOPS.map((stop, index) => (
          <li key={stop.id}>
            <span className="font-semibold text-slate-800">{index + 1}.</span> {stop.name}
          </li>
        ))}
      </ol>
      </div>
    </div>
  );
}
