import type { Metadata } from "next";
import { PrivacyPublicScreen } from "@/components/atlas-ui/privacy";

/* PrivacyPublic · Terms and privacy (signed out) — Figma frame 1:2888. */

export const metadata: Metadata = { title: "Terms and privacy" };

export default function TermsPage() {
  return <PrivacyPublicScreen />;
}
