import type { Metadata } from "next";
import { AtlasLogo } from "@/components/atlas-ui/asset";
import { StayCard } from "@/components/atlas-ui/stay-card";
import { AtlasBadge, AtlasButton, AtlasLink, FlowScreen, Spacer, type } from "@/components/atlas-ui/ui";

/* StayEnded · Stay ended — Figma frame 70:3765. */

export const metadata: Metadata = { title: "Your stay has ended" };

export default function StayEndedPage() {
  return (
    <main>
      <FlowScreen>
        <AtlasLogo tone="teal" width={39} height={44} />
        <div className="flex w-full flex-col items-start gap-[14px] pt-[24px]">
          <AtlasBadge icon="/atlas-ui/icon-home-teal-29.svg" iconSize={29} tone="sand" />
          <p className={type.eyebrow}>Hotel A</p>
          <h1 className={`w-full ${type.title}`}>Your stay has ended</h1>
          <p className={`w-full ${type.body} text-atlas-ink`}>
            Thanks for staying with Hotel A. Your achievements stay in your profile, but new places are no longer shown.
          </p>
          <StayCard title="Stay at Hotel A" dates="[check-in] – [check-out]" />
        </div>
        <Spacer />
        <div className="flex w-full flex-col items-start gap-[8px]">
          <AtlasButton to="Achievements">See my achievements</AtlasButton>
          <AtlasButton to="ScanHotel" tone="outline">
            Scan a new hotel code
          </AtlasButton>
          <AtlasLink
            to="SignIn"
            className="flex h-[44px] w-full shrink-0 items-center justify-center font-manrope text-[15px] font-semibold leading-[20px] text-atlas-slate"
          >
            Sign out
          </AtlasLink>
        </div>
      </FlowScreen>
    </main>
  );
}
