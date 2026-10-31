"use client";

import { useState } from "react";
import { AtlasAsset } from "./asset";
import { AtlasBottomBar, type AtlasTab } from "./bottom-bar";
import { PriceLevel } from "./place-card";

/*
 * NavLiquid · Bottom bar motion — Figma frame 1:1463, a motion reference: tapping a tab moves
 * the raised button to it without leaving the page. The "liquid" transition itself is one of
 * the deferred animations; for now the bar switches state instantly. The map here is the
 * frame's own static artwork, not the live map.
 */

export function NavLiquidScreen() {
  const [active, setActive] = useState<AtlasTab>("missions");
  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-atlas-dune">
      <AtlasAsset src="/atlas-ui/map-art-liquid.svg" width={390} height={764} className="absolute left-0 top-0 max-w-none" />
      <div className="absolute left-[16px] right-[16px] top-[calc(16px+env(safe-area-inset-top))] flex max-w-[358px] flex-col items-start gap-[2px] rounded-[16px] border border-atlas-beige bg-atlas-paper px-[14px] py-[10px]">
        <p className="font-grotesk text-[11px] font-medium uppercase leading-[14px] tracking-[0.88px] text-atlas-slate">Your stay</p>
        <p className="font-grotesk text-[18px] font-bold leading-[23px] text-atlas-teal">Hotel A</p>
      </div>
      <div className="absolute inset-x-0 bottom-[var(--atlas-nav-h)] flex h-[196px] flex-col items-start gap-[12px] overflow-hidden rounded-t-[24px] bg-atlas-paper px-[16px] pt-[10px] shadow-[0px_-4px_20px_0px_rgba(28,41,41,0.12)] wide:left-auto wide:right-[16px] wide:bottom-[16px] wide:w-[400px] wide:rounded-[24px]">
        <div className="h-[4px] w-[36px] shrink-0 rounded-[2px] bg-atlas-beige" />
        <h1 className="font-grotesk text-[20px] font-bold leading-[26px] text-atlas-teal">5 places for your stay</h1>
        <div className="flex w-full flex-col items-start gap-[6px] rounded-[16px] border border-atlas-beige px-[14px] py-[12px]">
          <p className="font-grotesk text-[17px] font-bold leading-[22px] text-atlas-teal">Partner Place 1</p>
          <div className="flex items-center gap-[8px]">
            <p className="font-manrope text-[13px] leading-[18px] text-atlas-ink">450 m · 45 min ·</p>
            <PriceLevel price="Moderate" />
          </div>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0">
        <AtlasBottomBar active={active} onSelect={setActive} />
      </div>
    </main>
  );
}
