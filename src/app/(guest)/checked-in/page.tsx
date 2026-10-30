import type { Metadata } from "next";
import { CheckedInScreen } from "@/components/atlas-ui/check-in-screens";

/* CheckedIn · Checked in (no achievement) — Figma frame 1:1024. A stop like the pool, with nothing to unlock. */

export const metadata: Metadata = { title: "Checked in" };

export default function CheckedInPage() {
  return <CheckedInScreen />;
}
