import Link from "next/link";
import { AtlasAsset, AtlasIcon } from "./asset";

/*
 * Unlocked · Achievement unlocked — Figma frame 1:466 — on real data, shown after a verified check-in in the
 * daily plan. Achievements are unlocks, not points: it names the badge and where it was earned, then sends the
 * guest on to their next three options. A badge earned on an earlier day is shown as already in the collection —
 * it is never unlocked twice.
 */

const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tbilisi" });

export function LiveUnlocked({
  achievementName,
  badgeImageUrl,
  placeName,
  visitedAt,
  newlyUnlocked,
  next,
}: {
  achievementName: string;
  badgeImageUrl: string | null;
  placeName: string;
  visitedAt: Date;
  newlyUnlocked: boolean;
  /** "next": more options are waiting; "done": the day is over. */
  next: "next" | "done";
}) {
  return (
    <main className="atlas-dark relative flex min-h-[100dvh] w-full flex-col items-center bg-atlas-teal">
      <AtlasAsset
        src="/atlas-ui/pattern-beige-wave-2.svg"
        width={390}
        height={139}
        className="pointer-events-none absolute left-0 top-[36px] opacity-45 wide:hidden"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-[36px] hidden h-[139px] bg-repeat-x opacity-45 wide:block"
        style={{ backgroundImage: "url(/atlas-ui/pattern-beige-wave-2.svg)" }}
      />

      <div
        role="status"
        className="relative flex min-h-px w-full max-w-[480px] flex-1 flex-col items-center justify-center gap-[16px] px-[24px] pt-[calc(120px+env(safe-area-inset-top))] short:pt-[32px]"
      >
        <span className="flex size-[112px] shrink-0 items-center justify-center overflow-hidden rounded-[56px] border-[6px] border-atlas-bronze/60 bg-atlas-paper">
          {badgeImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- admin-provided badge URL of unknown host
            <img src={badgeImageUrl} alt="" className="size-full object-cover" />
          ) : (
            <AtlasIcon src="/atlas-ui/icon-ach-teal-52.svg" size={52} />
          )}
        </span>
        <p className="font-grotesk text-[12px] uppercase leading-[15px] tracking-[1.2px] text-atlas-beige">
          {newlyUnlocked ? "Achievement unlocked" : "Already in your collection"}
        </p>
        <h1 className="w-full text-center font-grotesk text-[30px] font-bold leading-[34px] text-atlas-paper">
          {newlyUnlocked ? "You made it part of your journey." : "Welcome back."}
        </h1>
        <p className="text-center font-manrope text-[16px] leading-[22px] text-atlas-linen">
          {achievementName.includes(placeName) ? achievementName : `${achievementName} · ${placeName}`}
        </p>
        <p className="text-center font-manrope text-[13px] leading-[18px] text-atlas-beige">Checked in today, {CLOCK.format(visitedAt)}</p>
      </div>

      <div className="relative flex w-full max-w-[480px] flex-col items-start gap-[8px] px-[16px] pb-[calc(28px+env(safe-area-inset-bottom))] pt-[16px]">
        <Link
          href="/plan"
          className="flex min-h-[52px] w-full items-center justify-center rounded-[14px] bg-atlas-paper px-[12px] font-manrope text-[16px] font-semibold text-atlas-teal"
        >
          {next === "next" ? "On to the next location" : "See my day"}
        </Link>
      </div>
    </main>
  );
}
