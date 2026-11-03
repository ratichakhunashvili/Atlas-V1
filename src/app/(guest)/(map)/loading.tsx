import { AtlasBottomBar } from "@/components/atlas-ui/bottom-bar";

/*
 * Shown the moment Missions (or another map screen) is tapped, while the server loads the guest's
 * places. The shared map stays visible behind it (atlas-map.tsx keeps map routes shown), so only
 * the sheet of place cards is a placeholder for that moment. Tabs with their own loading.tsx
 * (My plan, Profile, Scan, ...) use that instead.
 */
export default function MapScreenLoading() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-busy="true">
      <p role="status" className="sr-only">
        Loading your places…
      </p>
      <div className="absolute bottom-0 left-0 right-0 flex flex-col">
        <div className="flex h-[196px] flex-col gap-[12px] rounded-t-[22px] bg-atlas-paper px-[16px] pt-[16px] shadow-[0px_-6px_24px_0px_rgba(28,41,41,0.12)]">
          <div className="h-[20px] w-[45%] animate-pulse rounded-[6px] bg-atlas-beige motion-reduce:animate-none" />
          <div className="flex gap-[10px]">
            <div className="h-[84px] w-[268px] shrink-0 animate-pulse rounded-[16px] bg-atlas-beige/70 motion-reduce:animate-none" />
            <div className="h-[84px] w-[80px] shrink-0 animate-pulse rounded-[16px] bg-atlas-beige/50 motion-reduce:animate-none" />
          </div>
        </div>
        <div className="pointer-events-auto">
          <AtlasBottomBar active="missions" />
        </div>
      </div>
    </div>
  );
}
