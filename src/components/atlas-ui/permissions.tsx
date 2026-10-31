"use client";

import { useState } from "react";
import { AtlasIcon } from "./asset";
import { AtlasBottomBar } from "./bottom-bar";
import { AtlasBackButton, type } from "./ui";

/*
 * Permissions · Profile › Permissions — Figma frame 1:2862, with the Switch component (1:198):
 * tapping toggles between On (teal track) and Off (mist track). A design state only: the switches
 * do not ask the browser for, or change, any permission, and the screen says so. Reading and
 * requesting real permissions is a future integration.
 */

function Switch({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onToggle} className="flex h-[44px] w-[60px] shrink-0 items-center justify-center">
      <span className={`relative h-[32px] w-[52px] rounded-[16px] ${on ? "bg-atlas-teal" : "bg-atlas-mist"}`}>
        <span
          className={`absolute top-[3px] size-[26px] rounded-[13px] bg-white shadow-[0px_1px_3px_0px_rgba(28,41,41,0.3)] ${on ? "left-[23px]" : "left-[3px]"}`}
        />
      </span>
    </button>
  );
}

function PermissionCard({ title, status, detail }: { title: string; status: string; detail: string }) {
  const [on, setOn] = useState(true);
  return (
    <section className="flex w-full flex-col items-start gap-[8px] rounded-[16px] border border-atlas-beige p-[14px]">
      <div className="flex w-full items-center justify-between gap-[8px]">
        <h2 className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal">{title}</h2>
        <Switch on={on} onToggle={() => setOn(!on)} label={title} />
      </div>
      <p className="w-full font-manrope text-[14px] leading-[1.5] text-atlas-ink">{on ? status : "Off in this prototype."}</p>
      <p className="w-full font-manrope text-[13px] leading-[1.5] text-atlas-slate">{detail}</p>
    </section>
  );
}

export function PermissionsScreen() {
  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col bg-atlas-paper">
      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col items-start gap-[14px] px-[16px] pb-[24px] pt-[calc(14px+env(safe-area-inset-top))] wide:pt-[calc(24px+env(safe-area-inset-top))]">
        <div className="flex w-full items-center gap-[10px]">
          <AtlasBackButton to="Stay" />
          <div className="flex flex-col items-start gap-[2px]">
            <p className={type.eyebrow}>Profile</p>
            <h1 className="font-grotesk text-[24px] font-bold leading-[31px] text-atlas-teal">Permissions</h1>
          </div>
        </div>
        <PermissionCard
          title="Location"
          status="On while you use Atlas."
          detail="Shows walk times and confirms you are at a place when you check in."
        />
        <PermissionCard
          title="Camera"
          status="Atlas asks each time you scan."
          detail="Reads Atlas codes and shows the camera view at attractions. Nothing is saved."
        />
        <div className="flex w-full items-start gap-[10px]">
          <AtlasIcon src="/atlas-ui/icon-info-slate.svg" size={18} className="shrink-0" />
          <p className="min-w-px flex-1 font-manrope text-[13px] leading-[1.5] text-atlas-slate">
            Your phone may also ask you to confirm. You can change these any time in your phone&apos;s settings.
          </p>
        </div>
        <p className="w-full font-manrope text-[12px] leading-[16px] text-atlas-slate">
          Prototype: these switches show the design only. They don&apos;t read or change your browser&apos;s permissions.
        </p>
      </div>
      <div className="sticky bottom-0 z-10">
        <AtlasBottomBar active="profile" />
      </div>
    </main>
  );
}
