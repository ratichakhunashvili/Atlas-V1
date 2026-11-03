import type { Metadata } from "next";
import { ProfileScreen } from "@/components/atlas-ui/profile";
import { loadGuestProfile } from "@/features/profile/guest-profile-data";
import { requireUser } from "@/lib/authorization";

/* Stay · Profile — Figma frame 1:1542. */

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  return <ProfileScreen profile={await loadGuestProfile(user.id)} />;
}
