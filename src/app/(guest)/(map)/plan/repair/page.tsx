import type { Metadata } from "next";
import { RepairStop } from "@/components/atlas-ui/repair-stop";

/* Repair · Fix an unavailable stop — Figma frame 1:778. */

export const metadata: Metadata = { title: "Fix a stop" };

export default function RepairPage() {
  return (
    <main>
      <RepairStop />
    </main>
  );
}
