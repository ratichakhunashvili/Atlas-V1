import type { Metadata } from "next";
import { ProfileScreen } from "@/components/atlas-ui/profile";
import { loadGuestProfile } from "@/features/profile/guest-profile-data";
import { requireUser } from "@/lib/authorization";

/* SignOutConfirm · Sign-out confirmation — Figma frame 70:4020. */

export const metadata: Metadata = { title: "Sign out of Atlas?" };

export default async function SignOutConfirmPage() {
  const user = await requireUser();
  return <ProfileScreen profile={await loadGuestProfile(user.id)} confirmSignOut />;
}
