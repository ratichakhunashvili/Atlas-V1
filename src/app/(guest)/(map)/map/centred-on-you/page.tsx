import type { Metadata } from "next";
import { MissionsMap } from "@/components/atlas-ui/map/missions-map";

/* Toast · Centred on your location — Figma frame 1:5054, shown over the home map. */

export const metadata: Metadata = { title: "Map, centred on you" };

export default function CentredOnYouPage() {
  return <MissionsMap initialToast="you" />;
}
