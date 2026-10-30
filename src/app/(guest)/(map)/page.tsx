import type { Metadata } from "next";
import { MissionsMap } from "@/components/atlas-ui/map/missions-map";

/* Main · Missions › Map (home) — Figma frame 1:205. Where the prototype starts. */

export const metadata: Metadata = { title: "Map" };

export default function HomePage() {
  return <MissionsMap />;
}
