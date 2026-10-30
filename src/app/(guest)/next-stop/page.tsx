import type { Metadata } from "next";
import { NextStopChoices } from "@/components/atlas-ui/next-stop-choices";

/* NextPath · Choose your next stop — Figma frame 1:5087. */

export const metadata: Metadata = { title: "Choose your next stop" };

export default function NextStopPage() {
  return <NextStopChoices />;
}
