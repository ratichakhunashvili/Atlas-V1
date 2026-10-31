import type { Metadata } from "next";
import { UnlockedScreen } from "@/components/atlas-ui/unlocked";

/* UnlockedA1 · Unlocked at Attraction 1 — Figma frame 1:2018. */

export const metadata: Metadata = { title: "Unlocked at Attraction 1" };

export default function Page() {
  return <UnlockedScreen variant="attraction" />;
}
