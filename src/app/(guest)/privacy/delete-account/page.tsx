import type { Metadata } from "next";
import { PrivacyScreen } from "@/components/atlas-ui/privacy";

/* PrivacyDelete · Delete account confirmation — Figma frame 1:1357. */

export const metadata: Metadata = { title: "Delete your account?" };

export default function PrivacyDeletePage() {
  return <PrivacyScreen confirmDelete />;
}
