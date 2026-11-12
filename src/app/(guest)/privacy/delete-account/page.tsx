import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PrivacyScreen } from "@/components/atlas-ui/privacy";
import { loadLegalViewer } from "@/features/legal/viewer";

/* PrivacyDelete · Delete account confirmation — Figma frame 1:1357. Signed-out visitors are sent to sign in first. */

export const metadata: Metadata = { title: "Delete your account?" };

export default async function PrivacyDeletePage() {
  const viewer = await loadLegalViewer();
  if (!viewer.signedIn) redirect(`/login?callbackUrl=${encodeURIComponent("/privacy/delete-account")}`);
  return <PrivacyScreen signedIn hotelName={viewer.hotelName} frontDesk={viewer.frontDesk} confirmDelete />;
}
