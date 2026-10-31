import type { Metadata } from "next";
import { SCAN_PROBLEMS } from "@/components/atlas-ui/scan-problems";
import { ScanProblemScreen } from "@/components/atlas-ui/scan-screens";

/* ScanProblemGone · Check-in problem · Place unavailable — Figma frame 1:1110. */

export const metadata: Metadata = { title: "Place unavailable" };

export default function Page() {
  return <ScanProblemScreen problem={SCAN_PROBLEMS.placeGone} />;
}
