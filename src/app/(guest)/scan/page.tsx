import type { Metadata } from "next";
import { ScanScreen } from "@/components/atlas-ui/scan-screens";

/* Scan · Scan (centre tab) — Figma frame 1:410. */

export const metadata: Metadata = { title: "Scan" };

export default function ScanPage() {
  return <ScanScreen />;
}
