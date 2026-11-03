import type { Metadata } from "next";
import { RepairStop } from "@/components/atlas-ui/repair-stop";

/*
 * RepairConfirm · Remove stop confirmation — Figma frame 1:1423. The repair screen with its
 * remove confirmation open, as a design-review route. Closing the confirmation returns to the
 * repair screen; removing can be undone from My plan for a few seconds.
 */

export const metadata: Metadata = { title: "Remove a stop?" };

export default function RepairConfirmPage() {
  return (
    <main>
      <RepairStop confirmOnOpen />
    </main>
  );
}
