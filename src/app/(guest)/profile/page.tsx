import type { Metadata } from "next";
import { ProfileScreen } from "@/components/atlas-ui/profile";

/* Stay · Profile — Figma frame 1:1542. */

export const metadata: Metadata = { title: "Profile" };

export default function ProfilePage() {
  return <ProfileScreen />;
}
