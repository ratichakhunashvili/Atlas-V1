import type { Metadata } from "next";
import { PreferencesForm } from "@/components/atlas-ui/preferences-form";

/* PrefsEdit · Edit preferences — Figma frame 70:3986. */

export const metadata: Metadata = { title: "Edit preferences" };

export default function PrefsEditPage() {
  return <PreferencesForm mode="edit" />;
}
