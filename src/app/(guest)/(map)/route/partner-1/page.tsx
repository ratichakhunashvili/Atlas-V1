import type { Metadata } from "next";
import { RouteScreen } from "@/components/atlas-ui/map/route-screen";

/* RouteP1 · Route to Partner Place 1 — Figma frame 1:2041. */

export const metadata: Metadata = { title: "Walking to Partner Place 1" };

export default function Page() {
  return <RouteScreen route="partner-1" />;
}
