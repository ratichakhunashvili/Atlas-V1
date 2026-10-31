"use client";

import { useRouter } from "next/navigation";
import { logoutAction } from "@/auth/actions";
import { useState, type ReactNode } from "react";
import { AtlasIcon, AtlasLogo } from "./asset";
import { AtlasBottomBar } from "./bottom-bar";
import { useLivePlan } from "./demo/live";
import type { AchievementId } from "./demo/plan-model";
import { AtlasDialog } from "./dialog";
import { DemoAction, FRONT_DESK_NOTICE } from "./navigation";
import { screenHref, type ScreenKey } from "./screen-hrefs";
import { AtlasButton, AtlasLink, AtlasTextLink } from "./ui";

/*
 * Stay · Profile — Figma frame 1:1542: the guest, their current stay, achievements, preferences
 * and app settings. Achievements and preferences come from the demo state. The language row is a
 * design state only: Georgian translation is a future integration, and the row says so rather
 * than relabelling an English interface. Calling the front desk is not connected either.
 *
 * SignOutConfirm (70:4020) is the same screen with the sign-out confirmation open. "Sign out"
 * ends the real session (logoutAction) and returns to sign-in; it
 * leaves the demo plan and achievements in this browser as they are, as the dialog says.
 */

const ROW = "flex min-h-[48px] w-full items-center justify-between gap-[8px] text-left";
const ALL_ACHIEVEMENTS: AchievementId[] = ["achievement-1", "achievement-2", "achievement-3", "achievement-4", "achievement-5"];

function SettingRow({ label, value, to, divider = true }: { label: string; value?: string; to: ScreenKey; divider?: boolean }) {
  return (
    <AtlasLink to={to} className={`${ROW} ${divider ? "border-b border-atlas-beige" : ""}`}>
      <span className="font-manrope text-[15px] leading-[20px] text-atlas-ink">{label}</span>
      <span className="flex items-center gap-[4px]">
        {value ? <span className="text-right font-manrope text-[13px] leading-[18px] text-atlas-slate">{value}</span> : null}
        <AtlasIcon src="/atlas-ui/icon-chevron.svg" size={16} className="shrink-0" />
      </span>
    </AtlasLink>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex w-full flex-col items-start">
      <h2 className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal">{title}</h2>
      {children}
    </section>
  );
}

function LanguageRow() {
  return (
    <div className="flex w-full flex-col border-b border-atlas-beige">
      <DemoAction
        className={ROW}
        notice="Georgian (ქართული) isn't available in this prototype yet. Translating the interface is a future integration."
        noticeClassName="mb-[8px]"
      >
        <span className="font-manrope text-[15px] leading-[20px] text-atlas-ink">Language</span>
        <span className="flex items-center gap-[4px]">
          <span className="font-manrope text-[13px] leading-[18px] text-atlas-slate">English</span>
          <AtlasIcon src="/atlas-ui/icon-chevron.svg" size={16} />
        </span>
      </DemoAction>
    </div>
  );
}

function Badge({ unlocked }: { unlocked: boolean }) {
  return unlocked ? (
    <span className="flex size-[40px] shrink-0 items-center justify-center rounded-[20px] border-[3px] border-atlas-bronze bg-atlas-teal">
      <AtlasIcon src="/atlas-ui/icon-ach-light-20.svg" size={20} />
    </span>
  ) : (
    <span className="flex size-[40px] shrink-0 items-center justify-center rounded-[20px] border-2 border-dashed border-atlas-umber">
      <AtlasIcon src="/atlas-ui/icon-ach-umber-18.svg" size={18} />
    </span>
  );
}

export function ProfileScreen({ confirmSignOut = false }: { confirmSignOut?: boolean }) {
  const router = useRouter();
  const live = useLivePlan();
  const [calling, setCalling] = useState(false);
  const [signingOut, setSigningOut] = useState(confirmSignOut);

  const closeSignOut = () => {
    setSigningOut(false);
    const href = screenHref("Stay");
    if (confirmSignOut && href) router.replace(href);
  };
  const unlockedCount = live.unlocked.length;
  const { preferences } = live.state;

  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col bg-atlas-paper">
      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-start gap-[14px] px-[16px] pb-[24px] pt-[calc(14px+env(safe-area-inset-top))] wide:pt-[calc(24px+env(safe-area-inset-top))]">
        <div className="flex w-full items-center gap-[12px]">
          <span className="flex size-[48px] shrink-0 items-center justify-center rounded-[24px] bg-atlas-sand font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal">
            G
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-start gap-px">
            <span className="font-grotesk text-[22px] font-bold leading-[28px] text-atlas-teal">[Guest name]</span>
            <span className="font-manrope text-[13px] leading-[18px] text-atlas-slate">[guest@email.com]</span>
          </span>
        </div>

        <section aria-label="Your stay" className="atlas-dark flex w-full items-center gap-[12px] rounded-[16px] bg-atlas-teal p-[12px]">
          <span className="flex size-[56px] shrink-0 items-center justify-center rounded-[12px] bg-atlas-lagoon font-manrope text-[10px] leading-[14px] text-atlas-beige">
            Photo
          </span>
          <span className="flex min-w-0 flex-1 flex-col items-start gap-[2px]">
            <span className="font-manrope text-[12px] leading-[16px] text-atlas-beige">Your stay</span>
            <span className="font-grotesk text-[18px] font-bold leading-[23px] text-atlas-paper">Hotel A</span>
            <span className="w-full font-manrope text-[13px] leading-[18px] text-atlas-linen">[check-in] – [check-out]</span>
            <span className="font-manrope text-[12px] leading-[16px] text-atlas-beige">Night 2 of 3</span>
          </span>
          <button
            type="button"
            aria-label="Call the front desk"
            aria-describedby={calling ? "front-desk-notice" : undefined}
            onClick={() => setCalling(true)}
            className="flex size-[44px] shrink-0 items-center justify-center rounded-[12px] bg-atlas-paper/15"
          >
            <AtlasIcon src="/atlas-ui/icon-phone-light-19.svg" size={19} />
          </button>
        </section>
        {calling ? (
          <p id="front-desk-notice" role="status" className="w-full rounded-[10px] bg-atlas-sand px-[10px] py-[8px] font-manrope text-[13px] leading-[18px] text-atlas-ink">
            {FRONT_DESK_NOTICE}
          </p>
        ) : null}

        <AtlasLink to="Achievements" className="flex w-full flex-col items-start gap-[10px] rounded-[16px] border border-atlas-beige p-[14px] text-left">
          <span className="flex w-full items-center justify-between">
            <span className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal">Achievements</span>
            <span className="flex items-center gap-[2px] font-manrope text-[13px] font-semibold leading-[18px] text-atlas-teal">
              See all
              <AtlasIcon src="/atlas-ui/icon-chevron-teal-16.svg" size={16} />
            </span>
          </span>
          <span className="flex flex-wrap items-start gap-[8px]">
            {ALL_ACHIEVEMENTS.map((id, index) => (
              <Badge key={id} unlocked={index < unlockedCount} />
            ))}
          </span>
          <span className="font-manrope text-[13px] leading-[18px] text-atlas-ink">
            <span className="font-semibold">
              {unlockedCount} of {ALL_ACHIEVEMENTS.length} unlocked
            </span>{" "}
            this stay
          </span>
          <span className="flex w-full items-start gap-[4px]">
            {ALL_ACHIEVEMENTS.map((id, index) => (
              <span key={id} className={`h-[5px] min-w-px flex-1 rounded-[3px] ${index < unlockedCount ? "bg-atlas-teal" : "bg-atlas-beige"}`} />
            ))}
          </span>
        </AtlasLink>

        <Section title="Your preferences">
          <SettingRow label="Interests" value={preferences.interests.join(", ") || "None chosen"} to="PrefsEdit" />
          <SettingRow label="Free time" value={preferences.time} to="PrefsEdit" />
          <SettingRow label="Price level" value={preferences.price} to="PrefsEdit" divider={false} />
        </Section>

        <Section title="App">
          <LanguageRow />
          <SettingRow label="Location" value="While using" to="Permissions" />
          <SettingRow label="Camera" value="Ask each time" to="Permissions" />
          <SettingRow label="Help and privacy" to="Privacy" divider={false} />
        </Section>

        <AtlasLink
          to="SignOutConfirm"
          className="flex h-[48px] w-full items-center justify-center rounded-[12px] border border-atlas-beige font-manrope text-[15px] font-semibold leading-[20px] text-atlas-ink"
        >
          Sign out
        </AtlasLink>

        <div className="flex w-full items-center gap-[12px] border-t border-atlas-beige pb-[4px] pt-[10px]">
          <AtlasLogo tone="teal" width={35} height={40} />
          <span className="flex flex-col items-start gap-px">
            <span className="font-grotesk text-[13px] font-bold leading-[17px] tracking-[2.6px] text-atlas-teal">ATLAS</span>
            <span className="font-manrope text-[12px] leading-[16px] text-atlas-slate">All trips leave a story. · [version]</span>
          </span>
        </div>
      </div>
      <div className="sticky bottom-0 z-10">
        <AtlasBottomBar active="profile" />
      </div>

      <AtlasDialog open={signingOut} onClose={closeSignOut} labelledBy="sign-out-title" describedBy="sign-out-body">
        <h2 id="sign-out-title" className="font-grotesk text-[20px] font-bold leading-[26px] text-atlas-ink">
          Sign out of Atlas?
        </h2>
        <p id="sign-out-body" className="w-full font-manrope text-[14px] leading-[1.55] text-atlas-ink">
          Your plan and achievements stay saved. You&apos;ll need to sign in again to see them.
        </p>
        <form action={logoutAction} className="w-full">
          <AtlasButton type="submit">Sign out</AtlasButton>
        </form>
        <AtlasTextLink onClick={closeSignOut}>Stay signed in</AtlasTextLink>
      </AtlasDialog>
    </main>
  );
}
