import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AtlasIcon } from "@/components/atlas-ui/asset";
import { AtlasBottomBar } from "@/components/atlas-ui/bottom-bar";
import { type } from "@/components/atlas-ui/ui";
import { findAchievementForPlace } from "@/db/queries/achievements";
import { findCurrentStayForUser } from "@/db/queries/hotel-stays";
import { hasVisitedPlace } from "@/db/queries/place-visits";
import { requireUser } from "@/lib/authorization";
import { describePriceLevel } from "@/services/advisor/preference-ranking";
import { estimateWalkMinutes } from "@/services/advisor/time-budget";
import { resolveVisitDuration } from "@/services/advisor/visit-duration";
import { listEligibleExperiencesForGuest } from "@/services/eligibility";

/*
 * One place's details, opened from a card on the home map or from Achievements.
 *
 * The Place is looked up ONLY among the experiences the eligibility service returns for the
 * signed-in guest's own stay (the Atlas catalogue). An id from the address bar that isn't one of
 * them — an uncontracted business, another hotel or its facility, a typo — gets the same "not
 * found" as an id that doesn't exist, so the page can't be used to discover places outside it.
 *
 * "Recommended by <hotel>" and the offer appear only when the guest's OWN hotel promotes this
 * partner; services/eligibility never sets a promotion from another hotel's partnership.
 */

export const metadata: Metadata = { title: "Place" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function categoryLabel(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ");
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[2px] rounded-[12px] border border-atlas-beige px-[10px] py-[8px]">
      <span className="font-manrope text-[12px] leading-[16px] text-atlas-slate">{label}</span>
      <span className="font-grotesk text-[15px] font-bold leading-[19px] text-atlas-ink">{value}</span>
    </div>
  );
}

export default async function PlaceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await requireUser();

  const eligible = await listEligibleExperiencesForGuest({ userId: user.id });
  const experience = eligible.experiences.find((item) => item.place.id === id);
  if (!experience || eligible.status !== "ok") notFound();

  const { place } = experience;
  const [achievement, visited, stay] = await Promise.all([
    findAchievementForPlace(place.id),
    hasVisitedPlace(user.id, place.id),
    experience.promotion ? findCurrentStayForUser(user.id) : null,
  ]);
  const facility = experience.source === "facility";
  const recommendedBy = experience.promotion ? stay?.place.name ?? null : null;
  const walk = facility ? null : Math.max(1, Math.round(estimateWalkMinutes(eligible.hotelLocation, { lat: place.latitude, lng: place.longitude })));
  const price = describePriceLevel(place.priceLevel);

  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col bg-atlas-paper">
      <div className="relative h-[200px] w-full shrink-0 bg-atlas-beige">
        {place.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- admin-entered URLs from any host; next/image would need each host allowlisted
          <img src={place.imageUrl} alt="" className="size-full object-cover" />
        ) : null}
        <Link
          href="/"
          aria-label="Back to the map"
          className="absolute left-[16px] top-[calc(16px+env(safe-area-inset-top))] flex size-[44px] items-center justify-center rounded-[12px] bg-atlas-paper shadow-[0_2px_8px_rgba(28,41,41,0.15)]"
        >
          <AtlasIcon src="/atlas-ui/icon-back.svg" size={20} />
        </Link>
      </div>

      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-start gap-[14px] px-[16px] pb-[120px] pt-[16px]">
        <div className="flex w-full flex-col items-start gap-[4px]">
          <p className={type.eyebrow}>
            {facility ? "At your hotel" : experience.source === "attraction" ? "Attraction" : "Partner"} · {categoryLabel(place.category)}
          </p>
          <h1 className={`w-full ${type.title} [overflow-wrap:anywhere]`}>{place.name}</h1>
          {facility ? (
            <p className="font-manrope text-[13px] leading-[18px] text-atlas-slate">Part of your hotel</p>
          ) : recommendedBy ? (
            <p className="flex items-center gap-[6px] font-manrope text-[13px] font-semibold leading-[18px] text-atlas-teal">
              <span aria-hidden className="size-[6px] shrink-0 rounded-full bg-atlas-bronze" />
              Recommended by {recommendedBy}
            </p>
          ) : null}
        </div>

        <div className="flex w-full gap-[8px]">
          {walk !== null ? <Fact label="Walk" value={`${walk} min`} /> : null}
          <Fact label="Visit" value={`${resolveVisitDuration(place).minutes} min`} />
          {price ? <Fact label="Price level" value={price} /> : null}
        </div>

        {experience.promotion?.offerText ? (
          <p className="w-full rounded-[12px] bg-atlas-sand px-[12px] py-[10px] font-manrope text-[14px] leading-[20px] text-atlas-ink">
            {experience.promotion.offerText}
          </p>
        ) : null}

        {place.description ? (
          <section className="flex w-full flex-col gap-[4px]">
            <h2 className={type.heading16}>About</h2>
            <p className={`${type.body} text-atlas-ink`}>{place.description}</p>
          </section>
        ) : null}

        {place.address || place.phone || place.website ? (
          <section className="flex w-full flex-col">
            {place.address ? (
              <p className="flex min-h-[44px] items-center gap-[8px] border-b border-atlas-beige font-manrope text-[14px] text-atlas-ink">
                <AtlasIcon src="/atlas-ui/icon-pin.svg" size={18} /> {place.address}
              </p>
            ) : null}
            {place.phone ? (
              <a href={`tel:${place.phone}`} className="flex min-h-[44px] items-center gap-[8px] border-b border-atlas-beige font-manrope text-[14px] text-atlas-teal">
                <AtlasIcon src="/atlas-ui/icon-phone.svg" size={18} /> {place.phone}
              </a>
            ) : null}
            {place.website ? (
              <a href={place.website} target="_blank" rel="noopener noreferrer" className="flex min-h-[44px] items-center gap-[8px] font-manrope text-[14px] text-atlas-teal">
                Website ↗
              </a>
            ) : null}
          </section>
        ) : null}

        {achievement ? (
          <section className="flex w-full items-center gap-[12px] rounded-[16px] border border-atlas-teal p-[12px]">
            <span
              className={`flex size-[44px] shrink-0 items-center justify-center rounded-[22px] ${
                visited ? "border-[3px] border-atlas-bronze bg-atlas-teal" : "border-2 border-dashed border-atlas-slate"
              }`}
            >
              <AtlasIcon src={visited ? "/atlas-ui/icon-ach-light-20.svg" : "/atlas-ui/icon-ach-slate-18.svg"} size={visited ? 20 : 18} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-grotesk text-[15px] font-bold leading-[19px] text-atlas-teal">{achievement.name}</span>
              <span className="font-manrope text-[13px] leading-[18px] text-atlas-slate">
                {visited ? "Unlocked" : "Add it to today's plan and check in there to unlock it"}
              </span>
            </span>
          </section>
        ) : null}

        <Link
          href="/plan"
          className="flex h-[48px] w-full items-center justify-center rounded-[12px] bg-atlas-teal font-manrope text-[15px] font-semibold text-atlas-paper"
        >
          Plan my day
        </Link>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-10">
        <AtlasBottomBar active="missions" />
      </div>
    </main>
  );
}
