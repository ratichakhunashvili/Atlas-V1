import type { Metadata } from "next";
import { AtlasBottomBar } from "@/components/atlas-ui/bottom-bar";

/*
 * Bottom bar — Figma component frame 7:795, which shows the three active states side by side.
 * Rendered here with the real component so the notch artwork and tab geometry can be checked
 * against the design before any screen uses it.
 */

export const metadata: Metadata = { title: "Bottom bar" };

export default function AtlasUiBottomBarKitPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center gap-[20px] bg-atlas-dune py-[20px]">
      <AtlasBottomBar active="missions" />
      <AtlasBottomBar active="scan" />
      <AtlasBottomBar active="profile" />
    </div>
  );
}
