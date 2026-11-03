import type { ReactNode } from "react";
import { AtlasMap } from "@/components/atlas-ui/map/atlas-map";
import { MapSceneProvider } from "@/components/atlas-ui/map/scene";

/*
 * The guest's main screens: home, the walking routes, and every bottom-bar tab (My plan, Scan,
 * Profile, Achievements, place details, preferences). They share this layout so the ONE Mapbox
 * map is created once and survives moving between them (CLAUDE.md: never recreate the map).
 *
 * Map screens describe a scene (useMapScene) and are drawn over the map. Other screens describe
 * none: the map is then hidden and stays idle until a map screen shows it again, so switching
 * back to Missions is instant instead of re-downloading the style and tiles.
 */
export default function MapScreensLayout({ children }: { children: ReactNode }) {
  return (
    <MapSceneProvider>
      <div className="relative min-h-[100dvh] w-full">
        <div className="fixed inset-0">
          <AtlasMap />
        </div>
        {children}
      </div>
    </MapSceneProvider>
  );
}
