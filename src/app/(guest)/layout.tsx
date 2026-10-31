import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { NavigationMemory } from "@/components/atlas-ui/navigation";

/*
 * The guest app on the Atlas design system (Figma 3N0YrlADgeuFyp8I8oh5of). At 390 wide every
 * screen renders its Figma frame; other widths adapt the composition (globals.css: the `wide`
 * and `short` variants) instead of scaling it.
 *
 * These screens currently run on the prototype's sample data (src/components/atlas-ui/demo),
 * kept in this browser only. Each functional phase replaces that data with the real server
 * features, screen by screen.
 */

export const metadata: Metadata = { title: { template: "%s · Atlas", default: "Atlas" } };

export const viewport: Viewport = {
  themeColor: "#0a4a4f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function GuestLayout({ children }: { children: ReactNode }) {
  return (
    <div className="atlas-app min-h-full w-full flex-1 bg-atlas-paper text-atlas-ink">
      <NavigationMemory />
      {children}
    </div>
  );
}
