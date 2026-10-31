import type { Metadata } from "next";
import { MissionsMap } from "@/components/atlas-ui/map/missions-map";

/* Toast · Centred on Hotel A — Figma frame 1:5059, shown over the home map. */

export const metadata: Metadata = { title: "Map, centred on Hotel A" };

export default function CentredOnHotelPage() {
  return <MissionsMap initialToast="hotel" />;
}
