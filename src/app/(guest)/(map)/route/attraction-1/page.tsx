import type { Metadata } from "next";
import { RouteScreen } from "@/components/atlas-ui/map/route-screen";

/* RouteA1 · Route to Attraction 1 — Figma frame 1:2133. */

export const metadata: Metadata = { title: "Walking to Attraction 1" };

export default function Page() {
  return <RouteScreen route="attraction-1" />;
}
