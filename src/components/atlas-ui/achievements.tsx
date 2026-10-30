"use client";

import { AtlasIcon } from "./asset";
import { AtlasBottomBar } from "./bottom-bar";
import { ACHIEVEMENTS, ACHIEVEMENT_ORDER, unlockedWhen } from "./achievement-detail";
import { ACHIEVEMENT_SCREEN, ACHIEVEMENT_TITLES, DETAIL_SCREEN, placeStatus, useLivePlan } from "./demo/live";
import { STOPS } from "./demo/plan-model";
import { PLACES, type PlaceId } from "./fixtures";
import { AtlasBackButton, AtlasLink, type } from "./ui";

/*
 * Achievements · Profile › Achievements — Figma frame 1:624. Achievements are unlocks earned by
 * checking in, never points: those unlocked so far, then the rest still to discover, each linking
 * to its details. Both lists follow the demo state.
 */

function dayOf(when: string): string {
  return when.split(",")[0] ?? when;
}

export function AchievementsScreen() {
  const live = useLivePlan();
  const unlocked = ACHIEVEMENT_ORDER.filter((id) => unlockedWhen(live, id));
  const locked = ACHIEVEMENT_ORDER.filter((id) => !unlockedWhen(live, id));
  const total = ACHIEVEMENT_ORDER.length;

  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col bg-atlas-paper">
      <div className="mx-auto flex w-full max-w-[720px] flex-1 flex-col items-start gap-[14px] px-[16px] pb-[20px] pt-[calc(14px+env(safe-area-inset-top))] wide:pt-[calc(24px+env(safe-area-inset-top))]">
        <div className="flex w-full items-center gap-[10px]">
          <AtlasBackButton to="Stay" />
          <div className="flex flex-col items-start gap-[2px]">
            <p className={type.eyebrow}>Profile</p>
            <h1 className="font-grotesk text-[24px] font-bold leading-[31px] text-atlas-teal">Achievements</h1>
          </div>
        </div>

        <div className="flex w-full flex-col items-start gap-[6px]">
          <div className="flex w-full flex-wrap items-start justify-between gap-x-[8px] font-manrope text-[13px] leading-[18px]">
            <p className="font-semibold text-atlas-ink">
              {unlocked.length} of {total} unlocked
            </p>
            <p className="text-atlas-slate">Check in at a place to unlock it</p>
          </div>
          <div className="flex w-full items-start gap-[4px]">
            {ACHIEVEMENT_ORDER.map((id, index) => (
              <div key={id} className={`h-[5px] min-w-px flex-1 rounded-[3px] ${index < unlocked.length ? "bg-atlas-teal" : "bg-atlas-beige"}`} />
            ))}
          </div>
        </div>

        <h2 className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal">Unlocked</h2>
        <ul className="grid w-full grid-cols-2 gap-[10px] wide:grid-cols-3">
          {unlocked.map((id) => {
            const fixture = ACHIEVEMENTS[id];
            const screen = ACHIEVEMENT_SCREEN[id];
            const when = unlockedWhen(live, id) ?? "";
            return (
              <li key={id} className="flex min-w-0">
                <AtlasLink
                  to={screen ?? "Achievements"}
                  className="flex min-w-0 flex-1 flex-col items-start gap-[6px] rounded-[14px] border border-atlas-beige p-[12px] text-left"
                >
                  <span className="flex size-[44px] shrink-0 items-center justify-center rounded-[22px] border-[3px] border-atlas-bronze bg-atlas-teal">
                    <AtlasIcon src="/atlas-ui/icon-ach-light-20.svg" size={20} />
                  </span>
                  <span className="font-grotesk text-[14px] font-bold leading-[18px] text-atlas-teal">{ACHIEVEMENT_TITLES[id]}</span>
                  <span className="w-full font-manrope text-[12px] leading-[16px] text-atlas-slate">
                    {STOPS[fixture.place].name} · {dayOf(when)}
                  </span>
                </AtlasLink>
              </li>
            );
          })}
        </ul>

        {locked.length > 0 ? (
          <>
            <h2 className="font-grotesk text-[16px] font-bold leading-[20px] text-atlas-teal">Still to discover</h2>
            <ul className="flex w-full flex-col items-start">
              {locked.map((id) => {
                const fixture = ACHIEVEMENTS[id];
                const place = PLACES[fixture.place as PlaceId];
                const status = placeStatus(live, fixture.place);
                const walk = place.meta.split(" · ")[0];
                const where = status === "next" || status === "planned" ? `${place.name} · ${walk.replace(" walk", "")} · in today's plan` : `${place.name} · ${walk}`;
                return (
                  <li key={id} className="w-full">
                    <AtlasLink
                      to={DETAIL_SCREEN[fixture.place] ?? "Main"}
                      className="flex min-h-[60px] w-full items-center gap-[10px] border-b border-atlas-beige py-[4px] text-left"
                    >
                      <span className="flex size-[40px] shrink-0 items-center justify-center rounded-[20px] border-2 border-dashed border-atlas-slate">
                        <AtlasIcon src="/atlas-ui/icon-ach-slate-18.svg" size={18} />
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col items-start gap-px">
                        <span className="font-grotesk text-[15px] font-bold leading-[19px] text-atlas-teal">{ACHIEVEMENT_TITLES[id]}</span>
                        <span className="w-full font-manrope text-[13px] leading-[18px] text-atlas-ink">{where}</span>
                        <span className="w-full font-manrope text-[12px] leading-[16px] text-atlas-slate">{fixture.hint}</span>
                      </span>
                      <AtlasIcon src="/atlas-ui/icon-chevron.svg" size={16} className="shrink-0" />
                    </AtlasLink>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}
      </div>
      <div className="sticky bottom-0 z-10">
        <AtlasBottomBar active="profile" />
      </div>
    </main>
  );
}
