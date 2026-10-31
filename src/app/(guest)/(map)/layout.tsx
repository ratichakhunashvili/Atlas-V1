import type { ReactNode } from "react";
import { AtlasMap } from "@/components/atlas-ui/map/atlas-map";
import { MapSceneProvider } from "@/components/atlas-ui/map/scene";

/*
 * Screens drawn over the map: home, the toasts, choosing the next stop in the sheet, and the
 * walking routes. They share this layout, so the one Mapbox map stays alive as the guest moves
 * between them; each screen only describes what the map should show.
 */
export default function MapScreensLayout({ children }: { children: ReactNode }) {
  return (
    <MapSceneProvider>
      <main className="relative h-[100dvh] w-full overflow-hidden">
        <AtlasMap />
        {children}
      </main>
    </MapSceneProvider>
  );
}
