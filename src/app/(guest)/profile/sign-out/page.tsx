import type { Metadata } from "next";
import { ProfileScreen } from "@/components/atlas-ui/profile";

/* SignOutConfirm · Sign-out confirmation — Figma frame 70:4020. */

export const metadata: Metadata = { title: "Sign out of Atlas?" };

export default function SignOutConfirmPage() {
  return <ProfileScreen confirmSignOut />;
}
