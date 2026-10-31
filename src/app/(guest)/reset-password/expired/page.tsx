import type { Metadata } from "next";
import { AtlasLogo } from "@/components/atlas-ui/asset";
import { AtlasBadge, AtlasButton, AtlasTextLink, FlowScreen, Spacer, type } from "@/components/atlas-ui/ui";

/* ResetExpired · Reset link expired — Figma frame 70:3715. */

export const metadata: Metadata = { title: "Reset link expired" };

export default function ResetExpiredPage() {
  return (
    <main>
      <FlowScreen>
        <AtlasLogo tone="teal" width={39} height={44} />
        <div className="flex w-full flex-col items-start gap-[14px] pt-[24px]">
          <AtlasBadge icon="/atlas-ui/icon-clock-teal-29.svg" iconSize={29} tone="sand" />
          <h1 className={`w-full ${type.title}`}>This link has expired</h1>
          <p className={`w-full ${type.body} text-atlas-slate`}>
            Reset links work for 30 minutes and can be used once. Ask for a new one and we will email it again.
          </p>
        </div>
        <Spacer />
        <div className="flex w-full flex-col items-start gap-[6px]">
          <AtlasButton to="ForgotPassword">Send a new link</AtlasButton>
          <AtlasTextLink to="SignIn">Back to sign in</AtlasTextLink>
        </div>
      </FlowScreen>
    </main>
  );
}
