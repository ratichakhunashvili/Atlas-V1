import type { Metadata } from "next";
import { SCAN_PROBLEMS } from "@/components/atlas-ui/scan-problems";
import { ScanProblemScreen } from "@/components/atlas-ui/scan-screens";

/* ScanProblemCamera · Check-in problem · Camera off — Figma frame 1:1127. */

export const metadata: Metadata = { title: "Camera access is off" };

export default function Page() {
  return <ScanProblemScreen problem={SCAN_PROBLEMS.cameraOff} />;
}
