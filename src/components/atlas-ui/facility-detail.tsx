import type { ReactNode } from "react";
import { AtlasIcon } from "./asset";
import type { StopId } from "./demo/plan-model";
import { DetailActions, FRONT_DESK, PlanAction } from "./detail-live";
import { AboutBlock, DetailBody, DetailHero, DetailScreen, DetailTitle, FactCards, InfoRows, SourceRow } from "./place-detail";
import type { ScreenKey } from "./screen-hrefs";
import { AtlasLink } from "./ui";

/*
 * Hotel facility details — FacilityDetail (Spa, 1:872) and FacilityPool (1:1933). A hotel-owned
 * facility is labelled "Part of Hotel A", never as a partner, and Atlas takes no bookings: the
 * booking row points guests to the hotel's own desk. Calling the desk is not connected in this
 * prototype, and the phone button says so instead of opening another screen.
 */

export function FacilityDetail(props: {
  place: StopId;
  name: string;
  photo: { src: string; width: number; height: number };
  where: string;
  visit: string;
  about: string;
  booking: string;
  extra: ReactNode;
}) {
  return (
    <DetailScreen
      hero={<DetailHero photo={props.photo} />}
      actions={<DetailActions tall secondary={FRONT_DESK} primary={<PlanAction place={props.place} />} />}
    >
      <DetailBody variant="place">
        <DetailTitle eyebrow="At your hotel · Wellness" name={props.name} gap={6}>
          <SourceRow icon="/atlas-ui/icon-home-slate-16.svg">Part of Hotel A</SourceRow>
        </DetailTitle>
        <FactCards
          facts={[
            { label: "Where", value: props.where, note: "[wing]" },
            { label: "Visit", value: props.visit, note: "typical" },
          ]}
        />
        <AboutBlock text={props.about} />
        <InfoRows
          rows={[
            { icon: "/atlas-ui/icon-info.svg", label: "Booking", value: props.booking },
            { icon: "/atlas-ui/icon-phone-18.svg", label: "Questions?", value: "Call the front desk" },
          ]}
        />
        {props.extra}
      </DetailBody>
    </DetailScreen>
  );
}

/** Link to the facility's achievement, with the bronze-ringed unlocked badge. */
export function FacilityAchievementLink({ to, title, line }: { to: ScreenKey; title: string; line: string }) {
  return (
    <AtlasLink to={to} className="flex w-full items-center gap-[12px] rounded-[16px] border border-atlas-beige p-[14px] text-left">
      <span className="flex size-[44px] shrink-0 items-center justify-center rounded-[22px] border-4 border-atlas-bronze/60 bg-atlas-teal">
        <AtlasIcon src="/atlas-ui/icon-ach-light-20.svg" size={20} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-[2px]">
        <span className="font-grotesk text-[15px] font-bold leading-[19px] text-atlas-teal">{title}</span>
        <span className="font-manrope text-[13px] leading-[18px] text-atlas-slate">{line}</span>
      </span>
    </AtlasLink>
  );
}

/** Dashed note for facilities that carry no achievement. */
export function NoAchievementNote() {
  return (
    <div className="flex w-full items-start gap-[10px] rounded-[14px] border border-dashed border-atlas-umber p-[12px]">
      <AtlasIcon src="/atlas-ui/icon-info-slate.svg" size={18} className="shrink-0" />
      <p className="min-w-0 flex-1 font-manrope text-[13px] leading-[1.5] text-atlas-slate">
        No achievement here. A visit still counts as a stop in your plan.
      </p>
    </div>
  );
}
