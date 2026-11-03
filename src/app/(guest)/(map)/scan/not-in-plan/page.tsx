import type { Metadata } from "next";
import { SCAN_PROBLEMS } from "@/components/atlas-ui/scan-problems";
import { ScanProblemScreen } from "@/components/atlas-ui/scan-screens";

/* ScanProblemToday · Check-in problem · Not in today's plan — Figma frame 1:1093. */

export const metadata: Metadata = { title: "Not in today's plan" };

export default function Page() {
  return <ScanProblemScreen problem={SCAN_PROBLEMS.notInPlan} />;
}
