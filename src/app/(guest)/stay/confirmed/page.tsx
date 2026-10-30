import type { Metadata } from "next";
import { ConfirmationScreen } from "@/components/atlas-ui/confirmation-screen";
import { StayCard } from "@/components/atlas-ui/stay-card";
import { AtlasButton, type } from "@/components/atlas-ui/ui";

/* StayConfirmed · Stay confirmed — Figma frame 70:3750. */

export const metadata: Metadata = { title: "Stay confirmed" };

export default function StayConfirmedPage() {
  return (
    <ConfirmationScreen
      patternClassName="top-[calc(36px+env(safe-area-inset-top))] opacity-30"
      actions={<AtlasButton to="PermLocation">Continue</AtlasButton>}
    >
      <p className={type.eyebrow}>Stay confirmed</p>
      <h1 className="w-full font-grotesk text-[28px] font-bold leading-[32px] text-atlas-teal">Welcome to Hotel A</h1>
      <p className="w-full font-manrope text-[16px] leading-[25px] text-atlas-ink">You&apos;re staying until [check-out date].</p>
      <StayCard title="Hotel A" dates="[check-in] – [check-out] · Night 1 of 3" />
      <p className="w-full font-manrope text-[13px] leading-[20px] text-atlas-slate">
        Atlas will show Hotel A&apos;s own facilities and the places it has approved.
      </p>
    </ConfirmationScreen>
  );
}
