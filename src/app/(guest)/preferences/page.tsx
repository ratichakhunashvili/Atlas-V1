import type { Metadata } from "next";
import { PreferencesForm } from "@/components/atlas-ui/preferences-form";

/* Preferences · Plan my time — Figma frame 1:590. */

export const metadata: Metadata = { title: "Plan my time" };

export default function PreferencesPage() {
  return <PreferencesForm />;
}
