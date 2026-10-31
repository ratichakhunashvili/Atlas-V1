import type { Metadata } from "next";
import { AtlasLogo } from "@/components/atlas-ui/asset";
import { AtlasButton, AtlasField, AtlasTextLink, FlowScreen, Spacer, type } from "@/components/atlas-ui/ui";

/* ResetPassword · Set a new password — Figma frame 70:3683 (the page the reset email opens). */

export const metadata: Metadata = { title: "Set a new password" };

export default function ResetPasswordPage() {
  return (
    <main>
      <FlowScreen>
        <AtlasLogo tone="teal" width={39} height={44} />
        <div className="flex w-full flex-col items-start gap-[8px] pt-[8px]">
          <h1 className={`w-full ${type.title}`}>Set a new password</h1>
          <p className={`w-full ${type.body} text-atlas-slate`}>Choose a password you haven&apos;t used for Atlas before.</p>
        </div>
        <div className="flex w-full flex-col items-start gap-[16px]">
          <AtlasField
            id="reset-new-password"
            label="New password"
            type="password"
            autoComplete="new-password"
            hint="At least 8 characters, with a letter and a number."
          />
          <AtlasField id="reset-confirm-password" label="Confirm new password" type="password" autoComplete="new-password" />
        </div>
        <Spacer />
        <div className="flex w-full flex-col items-start gap-[6px]">
          <AtlasButton to="ResetDone">Change password</AtlasButton>
          <AtlasTextLink to="SignIn">Cancel</AtlasTextLink>
        </div>
      </FlowScreen>
    </main>
  );
}
