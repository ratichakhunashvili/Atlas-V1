import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LiveMissionsMap } from "@/components/atlas-ui/map/live-missions-map";
import { AtlasButton, AtlasField, type } from "@/components/atlas-ui/ui";
import { findCurrentStayForUser } from "@/db/queries/hotel-stays";
import { checkInToHotelFormAction } from "@/features/hotel-stays/actions";
import { enterTestStayFormAction } from "@/features/test-entry/actions";
import { isTestEntryOffered } from "@/features/test-entry/offer";
import { requireUser } from "@/lib/authorization";
import { getDailyPlanForUser } from "@/services/advisor/daily-plan";
import { getEligibleMapPlacesForGuest } from "@/services/eligibility";

/*
 * Main · Missions › Map (home) — Figma frame 1:205 — on real data.
 *
 * Every Place on this page comes from getEligibleMapPlacesForGuest, which derives the hotel from
 * the guest's own active stay: its active facilities and its confirmed, in-window partners. No
 * request parameter widens that, and no valid stay means no Places at all — the guest is asked
 * to join their hotel instead of being shown "everything nearby".
 */

export const metadata: Metadata = { title: "Map" };
export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ checkinError?: string; checkinOk?: string }>;
}) {
  const { checkinError } = await searchParams;
  const user = await requireUser();
  const [map, stay, testEntryOffered] = await Promise.all([
    getEligibleMapPlacesForGuest({ userId: user.id }),
    findCurrentStayForUser(user.id),
    isTestEntryOffered(user.id),
  ]);

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
              : "Atlas shows the places your own hotel has approved. Type the code from the Atlas card at reception to start your stay."}
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
  if ((await getDailyPlanForUser(user.id)).status === "not_started") redirect("/preferences");

  return (
    <LiveMissionsMap
      hotel={{ name: stay.place.name, address: stay.place.address, at: [map.hotelLocation.lng, map.hotelLocation.lat] }}
      places={map.places.map((place) => ({
        id: place.id,
        name: place.name,
        source: place.source,
        category: place.category,
        address: place.address,
        priceLevel: place.priceLevel,
        at: [place.longitude, place.latitude],
      }))}
    />
  );
}
