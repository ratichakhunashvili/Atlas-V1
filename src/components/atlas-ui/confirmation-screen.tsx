import type { ReactNode } from "react";
import { AtlasAsset, AtlasIcon } from "./asset";
import { FlowScreen } from "./ui";

/*
 * Centred confirmation layout shared by ResetDone (70:3705) and StayConfirmed (70:3750): the
 * teal wave across the top, an 80px teal check badge with a Bronze ring, the message centred
 * in the free space, and the action pinned to the bottom.
 */

export function ConfirmationScreen({
  patternClassName,
  children,
  actions,
}: {
  /** Position and opacity of the wave: the frames differ (top 36 / 40, opacity 30% / 40%). */
  patternClassName: string;
  children: ReactNode;
  actions: ReactNode;
}) {
  return (
    <main>
      <FlowScreen className="overflow-hidden">
        <AtlasAsset
          src="/atlas-ui/pattern-teal-wave.svg"
          width={390}
          height={139}
          className={`pointer-events-none absolute left-0 max-w-none ${patternClassName}`}
        />
        <div className="relative flex min-h-px w-full flex-1 flex-col items-center justify-center gap-[14px] text-center">
          <span className="flex size-[80px] shrink-0 items-center justify-center rounded-[40px] border-4 border-atlas-bronze/60 bg-atlas-teal">
            <AtlasIcon src="/atlas-ui/icon-check-light-36.svg" size={36} />
          </span>
          {children}
        </div>
        <div className="relative flex w-full flex-col items-start gap-[6px]">{actions}</div>
      </FlowScreen>
    </main>
  );
}
