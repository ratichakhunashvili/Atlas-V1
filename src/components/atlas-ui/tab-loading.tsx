import { AtlasBottomBar, type AtlasTab } from "./bottom-bar";

/*
 * Shown the moment a tab is tapped, while the server prepares that screen: the tab highlights at
 * once and the screen's outline appears, instead of the old screen freezing until the data arrives.
 * Next.js also prefetches each tab up to this point, so it appears without a network round trip.
 */
export function TabLoading({ tab, label }: { tab: AtlasTab; label: string }) {
  return (
    <main className="relative flex min-h-[100dvh] w-full flex-col bg-atlas-paper" aria-busy="true">
      <div className="mx-auto flex w-full max-w-[640px] flex-1 flex-col gap-[14px] px-[16px] pt-[calc(18px+env(safe-area-inset-top))]">
        <p role="status" className="sr-only">
          Loading {label}…
        </p>
        <div className="h-[28px] w-[55%] animate-pulse rounded-[8px] bg-atlas-beige motion-reduce:animate-none" />
        <div className="h-[86px] w-full animate-pulse rounded-[16px] bg-atlas-beige/70 motion-reduce:animate-none" />
        <div className="h-[120px] w-full animate-pulse rounded-[16px] bg-atlas-beige/50 motion-reduce:animate-none" />
        <div className="h-[48px] w-full animate-pulse rounded-[12px] bg-atlas-beige/40 motion-reduce:animate-none" />
      </div>
      <div className="sticky bottom-0 z-10">
        <AtlasBottomBar active={tab} />
      </div>
    </main>
  );
}
