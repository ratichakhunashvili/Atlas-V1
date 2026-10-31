"use client";

import { AtlasIcon } from "./asset";
import { ACHIEVEMENT_TITLES, DETAIL_SCREEN, useLivePlan, type LivePlan } from "./demo/live";
import { STOPS, clock, type AchievementId, type StopId } from "./demo/plan-model";
import type { ScreenKey } from "./screen-hrefs";
import { AtlasBackButton, AtlasButton, Spacer, type } from "./ui";

/*
 * AchievementDetail (1:989) and AchievementDetailP1 (1:1983): one achievement — the badge, when
 * and how it was earned, the stay it belongs to, and a link back to its place. The other three
 * achievements reuse the same frame. Everything follows the demo state, so an achievement reads
 * "Still to discover" until its place is checked in.
 */

export type AchievementFixture = {
  id: AchievementId;
  place: StopId;
  how: string;
  /** How to unlock it, while locked. */
  hint: string;
  /** The spa's achievement was unlocked on an earlier day of the stay. */
  earlier?: string;
};

export const ACHIEVEMENTS: Record<AchievementId, AchievementFixture> = {
  "achievement-1": { id: "achievement-1", place: "partner-1", how: "Scanned the code at the counter", hint: "Scan the code at the counter" },
  "achievement-2": {
    id: "achievement-2",
    place: "spa",
    how: "Checked in at the spa desk",
    hint: "Check in at the spa desk",
    earlier: "Yesterday, 10:40",
  },
  "achievement-3": { id: "achievement-3", place: "partner-2", how: "Scanned the code at the counter", hint: "Scan the code at the counter" },
  "achievement-4": {
    id: "achievement-4",
    place: "attraction-1",
    how: "Found the marker with the camera view",
    hint: "Camera view when you are there",
  },
  "achievement-5": { id: "achievement-5", place: "partner-4", how: "Scanned the code at the counter", hint: "Scan the code at the counter" },
};

export const ACHIEVEMENT_ORDER: AchievementId[] = ["achievement-1", "achievement-2", "achievement-3", "achievement-4", "achievement-5"];

/** "Today, 16:12", "Yesterday, 10:40", or undefined while locked. */
export function unlockedWhen(live: LivePlan, id: AchievementId): string | undefined {
  const fixture = ACHIEVEMENTS[id];
  const today = live.state.plan.completed.find((c) => c.id === fixture.place);
  if (today && !fixture.earlier) return `Today, ${clock(today.at)}`;
  if (live.unlocked.includes(id)) return fixture.earlier ?? (today ? `Today, ${clock(today.at)}` : undefined);
  return undefined;
}

function InfoRow({ icon, label, value, divider = true }: { icon: string; label: string; value: string; divider?: boolean }) {
  return (
    <div className={`flex min-h-[48px] w-full items-center gap-[10px] py-[6px] ${divider ? "border-b border-atlas-beige" : ""}`}>
      <AtlasIcon src={icon} size={18} className="shrink-0" />
      <div className="flex min-w-px flex-1 flex-col items-start gap-px">
        <p className="font-manrope text-[14px] font-semibold leading-[19px] text-atlas-ink">{label}</p>
        <p className="font-manrope text-[13px] leading-[18px] text-atlas-slate">{value}</p>
      </div>
    </div>
  );
}

export function AchievementDetailScreen({ id }: { id: AchievementId }) {
  const live = useLivePlan();
  const fixture = ACHIEVEMENTS[id];
  const place = STOPS[fixture.place];
  const when = unlockedWhen(live, id);
  const detail = DETAIL_SCREEN[fixture.place] as ScreenKey | undefined;
  const viewLabel = place.kind === "facility" ? `View ${place.phrase}` : `View ${place.name}`;

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-[560px] flex-col items-start gap-[16px] bg-atlas-paper px-[20px] pb-[calc(28px+env(safe-area-inset-bottom))] pt-[calc(16px+env(safe-area-inset-top))]">
      <AtlasBackButton to="Achievements" />
      <div className="flex w-full flex-col items-center gap-[14px] pt-[12px]">
        {when ? (
          <span className="flex size-[112px] shrink-0 items-center justify-center rounded-[56px] border-4 border-atlas-bronze/60 bg-atlas-teal">
            <AtlasIcon src="/atlas-ui/icon-ach-light-50.svg" size={50} />
          </span>
        ) : (
          <span className="flex size-[112px] shrink-0 items-center justify-center rounded-[56px] border-4 border-dashed border-atlas-slate">
            <AtlasIcon src="/atlas-ui/icon-ach-slate-18.svg" size={18} />
          </span>
        )}
        <p className={type.eyebrow}>{when ? "Unlocked" : "Still to discover"}</p>
        <h1 className="w-full text-center font-grotesk text-[26px] font-bold leading-[30px] text-atlas-teal">{ACHIEVEMENT_TITLES[id]}</h1>
        <p className="font-manrope text-[15px] leading-[20px] text-atlas-slate">{place.name} · Hotel A</p>
      </div>
      <div className="flex w-full flex-col items-start">
        {when ? (
          <>
            <InfoRow icon="/atlas-ui/icon-clock.svg" label="When" value={when} />
            <InfoRow icon="/atlas-ui/icon-check-18.svg" label="How" value={fixture.how} />
          </>
        ) : (
          <InfoRow icon="/atlas-ui/icon-check-18.svg" label="How to unlock" value={fixture.hint} />
        )}
        <InfoRow icon="/atlas-ui/icon-home-18.svg" label="Stay" value="Hotel A · [check-in] – [check-out]" divider={false} />
      </div>
      <p className="w-full font-manrope text-[13px] leading-[1.5] text-atlas-slate">
        Achievements are a record of the places you have explored. They have no cash value.
      </p>
      <Spacer />
      {detail ? (
        <AtlasButton to={detail} tone="outline">
          {viewLabel}
        </AtlasButton>
      ) : null}
    </main>
  );
}

