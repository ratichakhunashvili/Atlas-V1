import type { Metadata } from "next";
import { PrivacyPublicScreen } from "@/components/atlas-ui/privacy";
import { loadLegalViewer } from "@/features/legal/viewer";

/* PrivacyPublic · Terms and privacy (signed out) — Figma frame 1:2888. */

export const metadata: Metadata = { title: "Terms and privacy" };

export default async function TermsPage() {
  const viewer = await loadLegalViewer();
  return <PrivacyPublicScreen hotelName={viewer.hotelName} />;
}
