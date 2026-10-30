import type { Metadata } from "next";
import { UnlockedScreen } from "@/components/atlas-ui/unlocked";

/* Unlocked · Achievement unlocked — Figma frame 1:466. */

export const metadata: Metadata = { title: "Achievement unlocked" };

export default function Page() {
  return <UnlockedScreen variant="partner" />;
}
