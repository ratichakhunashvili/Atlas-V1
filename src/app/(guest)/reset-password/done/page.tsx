import type { Metadata } from "next";
import { ConfirmationScreen } from "@/components/atlas-ui/confirmation-screen";
import { AtlasButton, type } from "@/components/atlas-ui/ui";

/* ResetDone · Password changed — Figma frame 70:3705. */

export const metadata: Metadata = { title: "Password changed" };

export default function ResetDonePage() {
  return (
    <ConfirmationScreen
      patternClassName="top-[calc(40px+env(safe-area-inset-top))] opacity-40"
      actions={<AtlasButton to="SignIn">Sign in</AtlasButton>}
    >
      <h1 className="w-full font-grotesk text-[26px] font-bold leading-[30px] text-atlas-teal">Password changed</h1>
      <p className={`w-full ${type.body} text-atlas-slate`}>You can now sign in with your new password.</p>
      <p className={`w-full ${type.caption}`}>Prototype: no password was changed. Password reset is a future integration.</p>
    </ConfirmationScreen>
  );
}
