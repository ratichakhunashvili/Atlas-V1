import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { preload } from "react-dom";
import { LiveMissionsMap } from "@/components/atlas-ui/map/live-missions-map";
import { AtlasButton, AtlasField, type } from "@/components/atlas-ui/ui";
import { findCurrentStayForUser } from "@/db/queries/hotel-stays";
import { listPlaceVisitsForUser } from "@/db/queries/place-visits";
import { findPreferencesForUser } from "@/db/queries/preferences";
import { checkInToHotelFormAction } from "@/features/hotel-stays/actions";
import { stayHeaderSummary } from "@/features/plan/interests";
import { enterTestStayFormAction } from "@/features/test-entry/actions";
import { isTestEntryOffered } from "@/features/test-entry/offer";
import { requireUser } from "@/lib/authorization";
import { getDailyPlanForUser } from "@/services/advisor/daily-plan";
import { getEligibleMapPlacesForGuest } from "@/services/eligibility";
import { listGuestPlaceModels } from "@/services/map3d";
import { boundsAround } from "@/services/eligibility/viewport";

/*
 * Main · Missions › Map (home) — Figma frame 1:205 — on real data.
 *
 * Every Place on this page comes from getEligibleMapPlacesForGuest, which derives the hotel from
 * the guest's own active stay: the Atlas catalogue (attractions, Atlas partners, the hotel's own
 * facilities). No request parameter widens that, and no valid stay means no Places at all — the
 * guest is asked to join their hotel instead of being shown "everything nearby".
 *
 * The page sends every eligible Place within 15 km of the hotel once; zooming or panning the map
 * never removes any of them from the list.
 */

/** Every eligible Place within this distance of the hotel is loaded once and stays in the list whatever the map shows. */
const CATALOGUE_RADIUS_METERS = 15_000;
/** A box that contains the 15 km circle at Georgia's latitudes (lets the database skip far Places); the radius then trims it. */
const CATALOGUE_HALF_SPAN_DEGREES = 0.2;

export const metadata: Metadata = { title: "Map" };
export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ checkinError?: string; checkinOk?: string }>;
}) {
  const { checkinError } = await searchParams;
  const user = await requireUser();
  const stay = await findCurrentStayForUser(user.id);
  const area = stay ? boundsAround({ lat: stay.place.latitude, lng: stay.place.longitude }, CATALOGUE_HALF_SPAN_DEGREES) : undefined;
  const [map, testEntryOffered, models] = await Promise.all([
    getEligibleMapPlacesForGuest({ userId: user.id, bounds: area, radiusMeters: CATALOGUE_RADIUS_METERS }),
    isTestEntryOffered(user.id),
    // Only enabled models of Places in this guest's own catalogue, plus their own hotel's (services/map3d).
    listGuestPlaceModels(user.id),
  ]);

  // Start downloading this guest's model files while the page and map are still loading, so they are ready (or close)
  // by the time the map wants to draw them. Same credentials mode as the loader's own fetch, so the download is reused.
  for (const model of models) preload(model.fileUrl, { as: "fetch", crossOrigin: "anonymous" });

  if (map.status !== "ok" || !stay) {
    // A stay that exists but is outside its dates gets its own words; either way, no places are shown.
    const now = new Date();
    const notYet = stay !== null && stay.checkOut === null && stay.checkIn > now;
    const ended = stay !== null && stay.checkOut === null && !notYet;
    return (
      <section
        aria-labelledby="join-title"
        className="absolute inset-0 z-10 flex justify-center overflow-y-auto bg-atlas-paper md:bg-atlas-dune md:px-[24px] md:py-[32px]"
      >
        <div className="flex w-full max-w-[560px] flex-col items-start gap-[16px] bg-atlas-paper px-[20px] pb-[calc(28px+env(safe-area-inset-bottom))] pt-[calc(32px+env(safe-area-inset-top))] md:h-fit md:rounded-[24px] md:border md:border-atlas-beige md:px-[32px]">
          <p className={type.eyebrow}>Atlas</p>
          <h1 id="join-title" className={`w-full ${type.title}`}>
            {notYet ? "Your stay hasn't started yet" : ended ? "Your stay has ended" : "Join your hotel"}
          </h1>
          <p className={`w-full ${type.body} text-atlas-slate`}>
            {notYet
              ? `Your stay at ${stay.place.name} starts on ${stay.checkIn.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}. Its places appear here from then.`
              : ended
              ? `Your stay at ${stay.place.name} is past its dates, so Atlas isn't showing its places. Staying somewhere new? Type that hotel's code to start.`
              : "Atlas shows what you can do from your hotel. Type the code from the Atlas card at reception to start your stay."}
          </p>
          {checkinError ? (
            <p role="alert" className="w-full rounded-[12px] border border-atlas-danger bg-atlas-danger-soft px-[14px] py-[12px] font-manrope text-[14px] leading-[1.45] text-atlas-danger">
              {checkinError}
            </p>
          ) : null}
          <form action={checkInToHotelFormAction} className="flex w-full flex-col items-start gap-[12px]">
            <AtlasField id="token" label="Hotel code" autoComplete="off" required />
            <AtlasButton type="submit">Start my stay</AtlasButton>
          </form>
          {testEntryOffered && (
            <form action={enterTestStayFormAction} className="w-full">
              <AtlasButton type="submit" tone="outline">
                Open the test stay (non-production only)
              </AtlasButton>
            </form>
          )}
        </div>
      </section>
    );
  }

  // Preferences come first, every day: until today's time and interests are set, there is nothing to show yet.
  const [plan, saved, visits] = await Promise.all([
    getDailyPlanForUser(user.id),
    findPreferencesForUser(user.id),
    listPlaceVisitsForUser(user.id),
  ]);
  if (plan.status === "not_started") redirect("/preferences");
  const summary = stayHeaderSummary({
    availableMinutes: plan.status === "no_stay" ? null : plan.availableMinutes,
    categories: saved?.categories ?? [],
    budget: saved?.budget ?? null,
  });

  return (
    <LiveMissionsMap
      summary={summary}
      models={models}
      hotel={{ name: stay.place.name, address: stay.place.address, at: [map.hotelLocation.lng, map.hotelLocation.lat] }}
      truncated={map.truncated}
      visitedPlaceIds={visits.map((visit) => visit.placeId)}
      places={map.places.map((place) => ({
        id: place.id,
        name: place.name,
        description: place.description,
        source: place.source,
        category: place.category,
        address: place.address,
        priceLevel: place.priceLevel,
        imageUrl: place.imageUrl,
        recommended: place.recommended,
        at: [place.longitude, place.latitude],
      }))}
    />
  );
}
