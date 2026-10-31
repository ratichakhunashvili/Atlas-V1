import type { Metadata } from "next";
import { MissionsMap } from "@/components/atlas-ui/map/missions-map";

/* Map · Location is off — Figma frame 70:4761, the home map without the guest's location. */

export const metadata: Metadata = { title: "Map, location off" };

export default function LocationOffPage() {
  return <MissionsMap locationOff />;
}
