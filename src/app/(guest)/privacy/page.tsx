import type { Metadata } from "next";
import { PrivacyScreen } from "@/components/atlas-ui/privacy";
import { loadLegalViewer } from "@/features/legal/viewer";

/* Privacy · Help and privacy — Figma frame 1:1303. Data download and deletion are shown to signed-in guests only. */

export const metadata: Metadata = { title: "Help and privacy" };

export default async function PrivacyPage() {
  const viewer = await loadLegalViewer();
  return <PrivacyScreen signedIn={viewer.signedIn} hotelName={viewer.hotelName} frontDesk={viewer.frontDesk} />;
}
