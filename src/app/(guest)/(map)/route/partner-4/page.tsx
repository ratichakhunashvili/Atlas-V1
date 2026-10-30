import type { Metadata } from "next";
import { RouteScreen } from "@/components/atlas-ui/map/route-screen";

/* RouteP4 · Route to Partner Place 4 — Figma frame 1:2088. */

export const metadata: Metadata = { title: "Walking to Partner Place 4" };

export default function Page() {
  return <RouteScreen route="partner-4" />;
}
