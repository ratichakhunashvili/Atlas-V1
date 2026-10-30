import type { Metadata } from "next";
import { RouteScreen } from "@/components/atlas-ui/map/route-screen";

/* Route · Walking route — Figma frame 1:731. */

export const metadata: Metadata = { title: "Walking to Partner Place 2" };

export default function Page() {
  return <RouteScreen route="partner-2" />;
}
