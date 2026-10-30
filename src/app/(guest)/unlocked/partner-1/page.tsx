import type { Metadata } from "next";
import { UnlockedScreen } from "@/components/atlas-ui/unlocked";

/* UnlockedP1 · Unlocked at Partner Place 1, then choose the next stop — Figma frame 1:5064. */

export const metadata: Metadata = { title: "Unlocked at Partner Place 1" };

export default function Page() {
  return <UnlockedScreen variant="partner-1" />;
}
