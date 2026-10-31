import type { Metadata } from "next";
import { ReorderStopsScreen } from "@/components/atlas-ui/reorder-stops";

/*
 * ReorderStops · Reorder stops — Figma frame 70:3786. My plan's stops with drag handles (and
 * arrow keys on each handle). A design-review route: it opens the plan the frame draws and
 * seeds the demo state with it; "Save order" writes the new order to the demo plan.
 */

export const metadata: Metadata = { title: "Reorder stops" };

export default function ReorderStopsPage() {
  return <ReorderStopsScreen />;
}
