import type { Metadata } from "next";
import { NoMatchScreen } from "@/components/atlas-ui/no-match";

/* NoMatch · Missions › No partner fits — Figma frame 1:352. */

export const metadata: Metadata = { title: "No partner fits" };

export default function NoMatchPage() {
  return <NoMatchScreen />;
}
