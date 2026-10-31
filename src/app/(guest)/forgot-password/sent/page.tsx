import type { Metadata } from "next";
import {
  AtlasBackButton,
  AtlasBadge,
  AtlasButton,
  AtlasTextLink,
  FlowScreen,
  Spacer,
  type,
} from "@/components/atlas-ui/ui";

/* ForgotSent · Reset link sent — Figma frame 1:1286. */

export const metadata: Metadata = { title: "Check your email" };

export default function ForgotSentPage() {
  return (
    <main>
      <FlowScreen gap={20}>
        <AtlasBackButton to="SignIn" />
        <div className="flex w-full flex-col items-start gap-[14px] pt-[24px]">
          <AtlasBadge icon="/atlas-ui/icon-mail-light.svg" iconSize={29} />
          <h1 className={`w-full ${type.title}`}>Check your email</h1>
          <p className={`w-full ${type.body} text-atlas-slate`}>
            If an Atlas account uses that email, a reset link is on its way. It works for 30 minutes.
          </p>
          <p className={`w-full ${type.caption}`}>Prototype: no email was sent. Password reset is a future integration.</p>
        </div>
        <Spacer />
        <div className="flex w-full flex-col items-start gap-[6px]">
          <AtlasButton to="SignIn">Back to sign in</AtlasButton>
          <AtlasTextLink to="ForgotPassword">Use a different email</AtlasTextLink>
        </div>
      </FlowScreen>
    </main>
  );
}
