import type { Metadata } from "next";
import { NextStopMap } from "@/components/atlas-ui/map/next-stop-map";

/* MapNextPath · Choose your next stop in the map sheet — Figma frame 1:5494. */

export const metadata: Metadata = { title: "Choose your next stop on the map" };

export default function Page() {
  return <NextStopMap />;
}
