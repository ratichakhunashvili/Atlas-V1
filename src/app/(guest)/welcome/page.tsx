import type { Metadata } from "next";
import { AtlasAsset, AtlasIcon, AtlasLogo } from "@/components/atlas-ui/asset";
import { AtlasButton, AtlasLink } from "@/components/atlas-ui/ui";

/* Welcome · Welcome (after hotel QR) — Figma frame 1:690. */

export const metadata: Metadata = { title: "Welcome" };

const STEPS = [
  "Choose your interests and free time",
  "Get a plan around your hotel",
  "Visit, check in, unlock achievements",
];

export default function WelcomePage() {
  return (
    <main className="atlas-dark relative flex min-h-[100dvh] w-full flex-col items-center bg-atlas-teal">
      <AtlasAsset
        src="/atlas-ui/pattern-beige-wave.svg"
        width={390}
        height={139}
        className="pointer-events-none absolute left-0 top-[196px] wide:hidden"
      />
      {/* Wider screens repeat the same artwork across the width rather than stretching it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[196px] hidden h-[139px] bg-repeat-x wide:block short:top-[24px]"
        style={{ backgroundImage: "url(/atlas-ui/pattern-beige-wave.svg)" }}
      />

      <div className="relative flex w-full max-w-[560px] flex-col items-start gap-[16px] px-[24px] pt-[calc(72px+env(safe-area-inset-top))] short:pt-[24px]">
        <AtlasLogo tone="light" width={66} height={76} />
        <div className="flex flex-col items-start gap-[4px]">
          <p className="font-grotesk text-[20px] font-bold leading-[26px] tracking-[4.8px] text-atlas-paper">ATLAS</p>
          <p className="font-manrope text-[13px] leading-[18px] text-atlas-beige">All trips leave a story.</p>
        </div>
      </div>

      <div aria-hidden className="min-h-px flex-1" />

      <div className="relative flex w-full max-w-[560px] flex-col items-start gap-[14px] px-[24px]">
        <div className="flex items-center gap-[8px] rounded-[14px] bg-atlas-paper/12 px-[12px] py-[6px]">
          <AtlasIcon src="/atlas-ui/icon-home-light.svg" size={16} />
          <p className="font-manrope text-[13px] leading-[18px] text-atlas-paper">Exploring with Hotel A</p>
        </div>
        <h1 className="w-full font-grotesk text-[30px] font-bold leading-[1.12] text-atlas-paper">
          Your stay is a starting point.
        </h1>
        <p className="w-full font-manrope text-[16px] leading-[1.55] text-atlas-linen">
          Tell us what you&apos;re curious about and how much time you have. We&apos;ll show you what Hotel A and its
          approved partners offer.
        </p>
      </div>

      <ol className="relative flex w-full max-w-[560px] flex-col items-start gap-[10px] px-[24px] pt-[24px]">
        {STEPS.map((step, index) => (
          <li key={step} className="flex items-center gap-[12px]">
            <span className="flex size-[28px] shrink-0 items-center justify-center rounded-[14px] border border-atlas-beige font-manrope text-[13px] leading-[18px] text-atlas-paper">
              {index + 1}
            </span>
            <span className="font-manrope text-[14px] leading-[19px] text-atlas-paper">{step}</span>
          </li>
        ))}
      </ol>

      <div className="relative flex w-full max-w-[560px] flex-col items-start gap-[10px] px-[24px] pb-[calc(28px+env(safe-area-inset-bottom))] pt-[28px]">
        <AtlasButton to="SignIn" tone="light">
          Get started
        </AtlasButton>
        <p className="w-full text-center font-manrope text-[12px] leading-[1.5] text-atlas-beige">
          You&apos;ll need an Atlas account. We only ask for what we need to plan your visits.{" "}
          <AtlasLink to="PrivacyPublic" className="text-atlas-beige">
            Privacy
          </AtlasLink>
        </p>
      </div>
    </main>
  );
}
