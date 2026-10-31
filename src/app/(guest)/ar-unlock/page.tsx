import type { Metadata } from "next";
import { ArUnlockScreen } from "@/components/atlas-ui/check-in-screens";

/*
 * ARUnlock · AR unlock (attraction) — Figma frame 1:436.
 *
 * The camera view is the design's illustration standing in for the live camera. Tapping the
 * marker simulates finding it, as the prototype does; no camera or location is used.
 */

export const metadata: Metadata = { title: "Camera view" };

export default function ArUnlockPage() {
  return <ArUnlockScreen />;
}
