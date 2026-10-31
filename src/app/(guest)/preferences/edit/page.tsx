import type { Metadata } from "next";
import { PreferencesForm } from "@/components/atlas-ui/preferences-form";
import { findPreferencesForUser } from "@/db/queries/preferences";
import { savePreferencesAction } from "@/features/plan/actions";
import { interestsForCategories, priceLabelFor } from "@/features/plan/interests";
import { requireUser } from "@/lib/authorization";

/* PrefsEdit · Edit preferences — Figma frame 70:3986, on real data. Saves for the next plan only. */

export const metadata: Metadata = { title: "Edit preferences" };
export const dynamic = "force-dynamic";

export default async function PrefsEditPage() {
  const user = await requireUser();
  const saved = await findPreferencesForUser(user.id);
  return (
    <PreferencesForm
      mode="edit"
      hotelName="your hotel"
      initial={{ time: "2 h", interests: interestsForCategories(saved?.categories ?? []), price: priceLabelFor(saved?.budget ?? null) }}
      action={savePreferencesAction}
    />
  );
}
