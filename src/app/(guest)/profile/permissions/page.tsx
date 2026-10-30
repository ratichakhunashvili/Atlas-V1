import type { Metadata } from "next";
import { PermissionsScreen } from "@/components/atlas-ui/permissions";

/* Permissions · Profile › Permissions — Figma frame 1:2862. */

export const metadata: Metadata = { title: "Permissions" };

export default function PermissionsPage() {
  return <PermissionsScreen />;
}
